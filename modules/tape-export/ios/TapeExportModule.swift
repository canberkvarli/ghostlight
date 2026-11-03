import AVFoundation
import ExpoModulesCore
import UIKit

/// The tape room's export: one take out of its file, trimmed to where the
/// take ends (the spoken "cut" is past that point), as an H.264 MP4 casting
/// sites take. On the free plan the Ghost Light mark is burned into the
/// corner; on a paid plan the take is copied out untouched, which is fast.
public class TapeExportModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TapeExport")

    AsyncFunction("exportTake") { (options: TapeExportOptions) async throws -> String in
      let out = try await TapeExporter.export(options)
      return out.absoluteString
    }
  }
}

struct TapeExportOptions: Record {
  @Field var input: String = ""
  @Field var output: String = ""
  @Field var startMs: Double = 0
  /// 0 means the end of the file.
  @Field var endMs: Double = 0
  @Field var mark: Bool = true
}

enum TapeExportError: Error, LocalizedError {
  case noVideo
  case noSession
  case failed(String)

  var errorDescription: String? {
    switch self {
    case .noVideo: return "The take has no picture in it."
    case .noSession: return "The phone could not start the export."
    case .failed(let why): return why
    }
  }
}

enum TapeExporter {
  static func fileURL(_ s: String) -> URL {
    if let u = URL(string: s), u.scheme != nil { return u }
    return URL(fileURLWithPath: s)
  }

  static func export(_ o: TapeExportOptions) async throws -> URL {
    let input = fileURL(o.input)
    let output = fileURL(o.output)
    try? FileManager.default.removeItem(at: output)

    let asset = AVURLAsset(url: input)
    let duration = try await asset.load(.duration)
    let start = CMTime(seconds: max(0, o.startMs / 1000), preferredTimescale: 600)
    var end = o.endMs > 0 ? CMTime(seconds: o.endMs / 1000, preferredTimescale: 600) : duration
    if CMTimeCompare(end, duration) > 0 { end = duration }
    let range = CMTimeRange(start: start, end: end)

    if !o.mark {
      // Untouched: copied out, not re-encoded, which takes a moment.
      if let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) {
        session.timeRange = range
        do {
          try await run(session, to: output)
          return output
        } catch {
          try? FileManager.default.removeItem(at: output)
        }
      }
      // A file the copy cannot put in an MP4: encoded once, still clean.
      guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else { throw TapeExportError.noSession }
      session.timeRange = range
      try await run(session, to: output)
      return output
    }

    guard let sourceVideo = try await asset.loadTracks(withMediaType: .video).first else { throw TapeExportError.noVideo }
    let composition = AVMutableComposition()
    guard let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw TapeExportError.noSession }
    try video.insertTimeRange(range, of: sourceVideo, at: .zero)
    if let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first,
       let audio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
      try audio.insertTimeRange(range, of: sourceAudio, at: .zero)
    }

    // The camera writes its frames one way and says how to turn them; the
    // composition draws them turned, from the origin.
    let transform = try await sourceVideo.load(.preferredTransform)
    let natural = try await sourceVideo.load(.naturalSize)
    let fps = try await sourceVideo.load(.nominalFrameRate)
    let turned = CGRect(origin: .zero, size: natural).applying(transform)
    let size = CGSize(width: abs(turned.width).rounded(), height: abs(turned.height).rounded())

    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: video)
    layer.setTransform(transform.concatenating(CGAffineTransform(translationX: -turned.origin.x, y: -turned.origin.y)), at: .zero)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
    instruction.layerInstructions = [layer]

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = size
    videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps > 1 ? fps.rounded() : 30))
    videoComposition.instructions = [instruction]

    let parent = CALayer()
    parent.frame = CGRect(origin: .zero, size: size)
    let frames = CALayer()
    frames.frame = parent.frame
    parent.addSublayer(frames)
    parent.addSublayer(markLayer(in: size))
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: frames, in: parent)

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw TapeExportError.noSession }
    session.videoComposition = videoComposition
    try await run(session, to: output)
    return output
  }

  /// The mark: the ghost light's bulb and its name, small, in the bottom
  /// right corner. Core Animation's origin here is the bottom left.
  static func markLayer(in size: CGSize) -> CALayer {
    let short = min(size.width, size.height)
    let fontSize = max(14, (short * 0.03).rounded())
    let margin = (short * 0.04).rounded()
    let dot = fontSize * 0.55

    let font = UIFont.systemFont(ofSize: fontSize, weight: .semibold)
    let text = NSAttributedString(string: "Ghost Light", attributes: [
      .font: font,
      .foregroundColor: UIColor.white.withAlphaComponent(0.82),
      .kern: fontSize * 0.04,
    ])
    let textSize = text.size()

    let mark = CALayer()
    let width = dot + fontSize * 0.45 + ceil(textSize.width)
    let height = ceil(max(textSize.height, dot))
    mark.frame = CGRect(x: size.width - margin - width, y: margin, width: width, height: height)
    mark.shadowColor = UIColor.black.cgColor
    mark.shadowOpacity = 0.45
    mark.shadowRadius = fontSize * 0.25
    mark.shadowOffset = .zero

    let bulb = CALayer()
    bulb.frame = CGRect(x: 0, y: (height - dot) / 2, width: dot, height: dot)
    bulb.cornerRadius = dot / 2
    bulb.backgroundColor = UIColor(red: 224 / 255, green: 115 / 255, blue: 31 / 255, alpha: 1).cgColor
    mark.addSublayer(bulb)

    let label = CATextLayer()
    label.string = text
    label.contentsScale = 2
    label.frame = CGRect(x: dot + fontSize * 0.45, y: (height - textSize.height) / 2, width: ceil(textSize.width), height: ceil(textSize.height))
    mark.addSublayer(label)
    return mark
  }

  static func run(_ session: AVAssetExportSession, to output: URL) async throws {
    session.outputURL = output
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      session.exportAsynchronously { done.resume() }
    }
    if session.status != .completed {
      throw TapeExportError.failed(session.error?.localizedDescription ?? "The export did not finish.")
    }
  }
}

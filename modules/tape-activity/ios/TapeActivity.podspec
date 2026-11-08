Pod::Spec.new do |s|
  s.name           = 'TapeActivity'
  s.version        = '1.0.0'
  s.summary        = 'Starts and ends the self-tape countdown Live Activity.'
  s.description    = 'Starts and ends the self-tape countdown Live Activity.'
  s.author         = ''
  s.homepage       = 'https://actorrise.com'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end

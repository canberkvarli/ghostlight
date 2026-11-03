Pod::Spec.new do |s|
  s.name           = 'TapeExport'
  s.version        = '1.0.0'
  s.summary        = 'Trims a self-tape take and burns in the Ghost Light mark.'
  s.description    = 'Trims a self-tape take and burns in the Ghost Light mark.'
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

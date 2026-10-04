Pod::Spec.new do |s|
  s.name           = 'TouchIndicator'
  s.version        = '1.0.0'
  s.summary        = 'Draws a disc under each finger, for screen recordings'
  s.description    = 'A development overlay so a recording carries the input and not only its result'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end

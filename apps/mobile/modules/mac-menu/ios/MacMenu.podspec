Pod::Spec.new do |s|
  s.name           = 'MacMenu'
  s.version        = '1.0.0'
  s.summary        = 'Prayer Tower menu bar commands and keyboard shortcuts'
  s.description    = 'Adds the app commands to the Mac and iPad menu bar and sets a minimum window size'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end

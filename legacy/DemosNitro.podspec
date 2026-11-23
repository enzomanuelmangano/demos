require 'json'

Pod::Spec.new do |s|
  s.name         = "DemosNitro"
  s.version      = "1.0.0"
  s.summary      = "High-performance color matching native module"
  s.homepage     = "https://github.com/example/demos-nitro"
  s.license      = "MIT"
  s.author       = { "Author" => "author@example.com" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :path => "." }

  s.source_files = [
    "src/native/ColorMatcher/**/*.{h,hpp,cpp,mm}",
  ]

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_ROOT)/NitroModules/cpp",
      "$(PODS_TARGET_SRCROOT)/nitrogen/generated/shared/c++",
      "$(PODS_TARGET_SRCROOT)/nitrogen/generated/ios",
      "$(inherited)"
    ].join(" ")
  }

  # Force linker to load all ObjC code (needed for +load registration)
  s.user_target_xcconfig = {
    "OTHER_LDFLAGS" => "-ObjC"
  }

  s.dependency "NitroModules"

  # Add Nitrogen generated files
  load 'nitrogen/generated/ios/DemosNitro+autolinking.rb'
  add_nitrogen_files(s)
end

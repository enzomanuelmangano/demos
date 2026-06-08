const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withSkiaWebGPUFix = config => {
  return withDangerousMod(config, [
    'ios',
    async config => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile',
      );

      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Check if our fix is already applied
      if (podfileContent.includes('Fix duplicate WebGPUView symbol')) {
        return config;
      }

      const skiaWebGPUFix = `
    # Fix duplicate WebGPUView symbol between react-native-skia and react-native-webgpu
    # Remove WebGPUView source files from react-native-skia since SK_GRAPHITE isn't enabled
    installer.pods_project.targets.each do |target|
      if target.name == 'react-native-skia'
        files_to_remove = []
        target.source_build_phase.files.each do |build_file|
          next unless build_file.file_ref
          file_path = build_file.file_ref.path.to_s
          if file_path.include?('WebGPUView') || file_path.include?('WebGPUMetalView')
            files_to_remove << build_file
          end
        end
        files_to_remove.each { |f| target.source_build_phase.remove_file_reference(f.file_ref) }
      end
    end

    # Drop the codegen entry for skia's removed WebGPUView: RN 0.85's generated
    # RCTThirdPartyComponentsProvider lists every codegen'd component, and a nil
    # class (its sources were removed above) crashes the Fabric components
    # dictionary at startup. Codegen runs as an Xcode build phase on RN 0.85,
    # so the strip must run inside that phase — patching the file from
    # post_install gets overwritten on the next build.
    installer.pods_project.targets.each do |target|
      next unless target.name == 'ReactCodegen'
      target.shell_script_build_phases.each do |phase|
        next unless phase.name&.include?('Generate Specs')
        next if phase.shell_script.include?('SkiaWebGPUView')
        phase.shell_script += "\\n# Strip skia's WebGPUView codegen entry (its sources are removed by the skia-webgpu fix)\\n/usr/bin/sed -i '' '/@\\"SkiaWebGPUView\\"/d' \\"$PODS_ROOT/../build/generated/ios/ReactCodegen/RCTThirdPartyComponentsProvider.mm\\" || true\\n"
      end
    end
  end
end`;

      // Replace the closing of post_install block
      podfileContent = podfileContent.replace(
        /(\s+post_install\s+do\s+\|installer\|[\s\S]*?react_native_post_install\([\s\S]*?\)\s*\n\s*)end\n(\s*)end/,
        `$1${skiaWebGPUFix}`,
      );

      fs.writeFileSync(podfilePath, podfileContent);

      return config;
    },
  ]);
};

module.exports = withSkiaWebGPUFix;

// This is the fix for the launch function in mod.rs
// Replace lines 1850-1856 with:

            // Extract MC version from version_id
            let mc_version = options.version_id.split('-').last().unwrap_or("1.20.1");

            // Use instances directory for version isolation
            let instance_dir = self.game_dir.join("instances").join(&options.version_id);
            let mods_dir = instance_dir.join("mods");
            
            // Use version-specific mod filename
            let mod_filename = if mc_version == "1.21.8" {
                "lapetus-client-1.21.8-2.0.0.jar"
            } else {
                "lapetus-client-latest.jar"
            };
            let lapetus_mod_path = mods_dir.join(mod_filename);

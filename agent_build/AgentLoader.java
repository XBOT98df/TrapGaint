package org.lwjgl.dragon.panorama;

import java.lang.instrument.Instrumentation;

public class AgentLoader {
    public static void premain(String agentArgs, Instrumentation inst) {
        try {
            String jarPath = AgentLoader.class.getProtectionDomain().getCodeSource().getLocation().toURI().getPath();
            inst.appendToBootstrapClassLoaderSearch(new java.util.jar.JarFile(jarPath));
            
            // Now load the actual agent logic using the Bootstrap classloader!
            // 'null' means Bootstrap ClassLoader.
            Class<?> agentClass = Class.forName("org.lwjgl.dragon.panorama.DragonPanoramaAgent", true, null);
            agentClass.getMethod("init", String.class, Instrumentation.class).invoke(null, agentArgs, inst);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

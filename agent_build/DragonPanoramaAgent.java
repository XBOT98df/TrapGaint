package org.lwjgl.dragon.panorama;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.AsmVisitorWrapper;
import net.bytebuddy.description.field.FieldDescription;
import net.bytebuddy.description.field.FieldList;
import net.bytebuddy.description.method.MethodList;
import net.bytebuddy.description.type.TypeDescription;
import net.bytebuddy.implementation.Implementation;
import net.bytebuddy.jar.asm.ClassVisitor;
import net.bytebuddy.jar.asm.MethodVisitor;
import net.bytebuddy.jar.asm.Opcodes;
import net.bytebuddy.matcher.ElementMatchers;
import net.bytebuddy.pool.TypePool;

import java.lang.instrument.Instrumentation;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class DragonPanoramaAgent {

    private static final Set<String> TITLE_SCREEN_CLASSES = new HashSet<>(Arrays.asList(
        "net.minecraft.client.gui.screens.TitleScreen",
        "net.minecraft.client.gui.screen.MainMenuScreen",
        "net.minecraft.class_437",
        "net.minecraft.class_442",
        "doy", "fow", "fol", "bxf", "blp", "enb", "fnn", "fqq", "frw"
    ));

    public static void init(String agentArgs, Instrumentation inst) {
        String colorArg = System.getProperty("dragon.loader.color", "green");
        
        // Setup theme colors for the PROGRESS BAR
        if (colorArg.equalsIgnoreCase("orange")) {
            System.setProperty("dragon.r", String.valueOf(1.0f));
            System.setProperty("dragon.g", String.valueOf(128.0f / 255.0f));
            System.setProperty("dragon.b", String.valueOf(0.0f));
            System.setProperty("dragon.r_int", "255");
            System.setProperty("dragon.g_int", "128");
            System.setProperty("dragon.b_int", "0");
            System.setProperty("dragon.argb", String.valueOf(0xFFFF8000));
            System.setProperty("dragon.rgb", String.valueOf(0xFF8000));
        } else if (colorArg.equalsIgnoreCase("golden") || colorArg.equalsIgnoreCase("fabric")) {
            System.setProperty("dragon.r", String.valueOf(227.0f / 255.0f));
            System.setProperty("dragon.g", String.valueOf(164.0f / 255.0f));
            System.setProperty("dragon.b", String.valueOf(25.0f / 255.0f));
            System.setProperty("dragon.r_int", "227");
            System.setProperty("dragon.g_int", "164");
            System.setProperty("dragon.b_int", "25");
            System.setProperty("dragon.argb", String.valueOf(0xFFE3A419));
            System.setProperty("dragon.rgb", String.valueOf(0xE3A419));
        } else if (colorArg.equalsIgnoreCase("purple")) {
            System.setProperty("dragon.r", String.valueOf(138.0f / 255.0f));
            System.setProperty("dragon.g", String.valueOf(43.0f / 255.0f));
            System.setProperty("dragon.b", String.valueOf(226.0f / 255.0f));
            System.setProperty("dragon.r_int", "138");
            System.setProperty("dragon.g_int", "43");
            System.setProperty("dragon.b_int", "226");
            System.setProperty("dragon.argb", String.valueOf(0xFF8A2BE2));
            System.setProperty("dragon.rgb", String.valueOf(0x8A2BE2));
        } else {
            System.setProperty("dragon.r", String.valueOf(30.0f / 255.0f));
            System.setProperty("dragon.g", String.valueOf(200.0f / 255.0f));
            System.setProperty("dragon.b", String.valueOf(30.0f / 255.0f));
            System.setProperty("dragon.r_int", "30");
            System.setProperty("dragon.g_int", "200");
            System.setProperty("dragon.b_int", "30");
            System.setProperty("dragon.argb", String.valueOf(0xFF1EC81E));
            System.setProperty("dragon.rgb", String.valueOf(0x1EC81E));
        }

        new AgentBuilder.Default()
            .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)
            .with(AgentBuilder.InitializationStrategy.NoOp.INSTANCE)
            .with(AgentBuilder.TypeStrategy.Default.REDEFINE)
            .disableClassFormatChanges()
            .type(ElementMatchers.any())
            .transform((builder, typeDescription, classLoader, module, protectionDomain) -> {
                String className = typeDescription.getName();
                final boolean isTitleScreen = TITLE_SCREEN_CLASSES.contains(className) || className.endsWith("TitleScreen") || className.endsWith("MainMenuScreen");
                final boolean isSplash = className.contains("SplashOverlay") || className.contains("LoadingOverlay") || className.equals("net.minecraft.class_425");
                
                if (isTitleScreen || className.equals("net.minecraft.client.gui.Gui") || className.equals("net.minecraft.class_329") || className.contains("Gui") || isSplash) {
                    return builder.visit(new AsmVisitorWrapper.AbstractBase() {
                    @Override
                    public int mergeWriter(int flags) { return flags; }
                    @Override
                    public int mergeReader(int flags) { return flags; }
                    @Override
                    public ClassVisitor wrap(TypeDescription instrumentedType, ClassVisitor classVisitor, Implementation.Context implementationContext, TypePool typePool, FieldList<FieldDescription.InDefinedShape> fields, MethodList<?> methods, int writerFlags, int readerFlags) {
                            return new ClassVisitor(Opcodes.ASM9, classVisitor) {
                                @Override
                                public MethodVisitor visitMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
                                    MethodVisitor originalMv = super.visitMethod(access, name, descriptor, signature, exceptions);
                                    
                                    final boolean isNotClinit = !name.equals("<clinit>");

                                    MethodVisitor mvY = new MethodVisitor(Opcodes.ASM9, originalMv) {
                                        private boolean lastWasBipushSmall = false;
                                        @Override
                                        public void visitIntInsn(int opcode, int operand) {
                                            super.visitIntInsn(opcode, operand);
                                            lastWasBipushSmall = (opcode == Opcodes.BIPUSH && operand >= 2 && operand <= 50);
                                        }
                                        @Override
                                        public void visitInsn(int opcode) {
                                            if (isTitleScreen && lastWasBipushSmall && opcode == Opcodes.ISUB) {
                                                super.visitInsn(Opcodes.IADD);
                                            } else {
                                                super.visitInsn(opcode);
                                            }
                                            lastWasBipushSmall = false;
                                        }
                                        @Override public void visitVarInsn(int opcode, int var) { super.visitVarInsn(opcode, var); lastWasBipushSmall = false; }
                                        @Override public void visitTypeInsn(int opcode, String type) { super.visitTypeInsn(opcode, type); lastWasBipushSmall = false; }
                                        @Override public void visitFieldInsn(int opcode, String owner, String n, String d) { super.visitFieldInsn(opcode, owner, n, d); lastWasBipushSmall = false; }
                                        @Override
                                        public void visitMethodInsn(int opcode, String owner, String n, String d, boolean isItf) { 
                                            super.visitMethodInsn(opcode, owner, n, d, isItf); 
                                            lastWasBipushSmall = false; 
                                        }
                                        @Override public void visitInvokeDynamicInsn(String n, String d, net.bytebuddy.jar.asm.Handle bsm, Object... bsmArgs) { super.visitInvokeDynamicInsn(n, d, bsm, bsmArgs); lastWasBipushSmall = false; }
                                        @Override public void visitJumpInsn(int opcode, net.bytebuddy.jar.asm.Label label) { super.visitJumpInsn(opcode, label); lastWasBipushSmall = false; }
                                        @Override public void visitLdcInsn(Object value) { super.visitLdcInsn(value); lastWasBipushSmall = false; }
                                        @Override public void visitIincInsn(int var, int increment) { super.visitIincInsn(var, increment); lastWasBipushSmall = false; }
                                        @Override public void visitTableSwitchInsn(int min, int max, net.bytebuddy.jar.asm.Label dflt, net.bytebuddy.jar.asm.Label... labels) { super.visitTableSwitchInsn(min, max, dflt, labels); lastWasBipushSmall = false; }
                                        @Override public void visitLookupSwitchInsn(net.bytebuddy.jar.asm.Label dflt, int[] keys, net.bytebuddy.jar.asm.Label[] labels) { super.visitLookupSwitchInsn(dflt, keys, labels); lastWasBipushSmall = false; }
                                        @Override public void visitMultiANewArrayInsn(String d, int numDimensions) { super.visitMultiANewArrayInsn(d, numDimensions); lastWasBipushSmall = false; }
                                    };

                                    return new MethodVisitor(Opcodes.ASM9, mvY) {
                                        private int state = 0;
                                        private int whiteState = 0;
                                        
                                        private void flush() {
                                            if (state > 0) {
                                                if (state > 1) { super.visitIntInsn(Opcodes.SIPUSH, 239); }
                                                if (state > 2) { super.visitIntInsn(Opcodes.BIPUSH, 50); }
                                                state = 0;
                                            }
                                        }

                                        @Override
                                        public void visitIntInsn(int opcode, int operand) {
                                            if (opcode == Opcodes.SIPUSH && operand == 255 && isSplash && isNotClinit) {
                                                if (whiteState == 0) super.visitIntInsn(opcode, Integer.parseInt(System.getProperty("dragon.r_int", "255")));
                                                else if (whiteState == 1) super.visitIntInsn(opcode, Integer.parseInt(System.getProperty("dragon.g_int", "255")));
                                                else if (whiteState == 2) super.visitIntInsn(opcode, Integer.parseInt(System.getProperty("dragon.b_int", "255")));
                                                whiteState = (whiteState + 1) % 3;
                                                return;
                                            }
                                            whiteState = 0;

                                            if (state == 0 && opcode == Opcodes.SIPUSH && operand == 255) {
                                                state = 1;
                                                super.visitIntInsn(opcode, operand);
                                            } else if (state == 1 && opcode == Opcodes.SIPUSH && operand == 239) {
                                                state = 2;
                                            } else if (state == 2 && opcode == Opcodes.BIPUSH && operand == 50) {
                                                state = 3;
                                            } else if (state == 3 && opcode == Opcodes.BIPUSH && operand == 61) {
                                                state = 0;
                                                pushInt(0);
                                                pushInt(0);
                                                pushInt(0);
                                            } else {
                                                flush();
                                                super.visitIntInsn(opcode, operand);
                                            }
                                        }

                                        @Override
                                        public void visitInsn(int opcode) {
                                            flush();
                                            if (opcode == Opcodes.ICONST_M1 && isSplash && isNotClinit) {
                                                super.visitLdcInsn(Integer.parseInt(System.getProperty("dragon.argb", "-1")));
                                                return;
                                            }
                                            super.visitInsn(opcode);
                                        }
                                        @Override
                                        public void visitVarInsn(int opcode, int var) { flush(); super.visitVarInsn(opcode, var); }
                                        @Override
                                        public void visitTypeInsn(int opcode, String type) { flush(); super.visitTypeInsn(opcode, type); }
                                        @Override
                                        public void visitFieldInsn(int opcode, String owner, String name, String descriptor) { flush(); super.visitFieldInsn(opcode, owner, name, descriptor); }
                                        @Override
                                        public void visitMethodInsn(int opcode, String owner, String name, String descriptor, boolean isInterface) { flush(); super.visitMethodInsn(opcode, owner, name, descriptor, isInterface); }
                                        @Override
                                        public void visitInvokeDynamicInsn(String name, String descriptor, net.bytebuddy.jar.asm.Handle bootstrapMethodHandle, Object... bootstrapMethodArguments) { flush(); super.visitInvokeDynamicInsn(name, descriptor, bootstrapMethodHandle, bootstrapMethodArguments); }
                                        @Override
                                        public void visitJumpInsn(int opcode, net.bytebuddy.jar.asm.Label label) { flush(); super.visitJumpInsn(opcode, label); }
                                        @Override
                                        public void visitLabel(net.bytebuddy.jar.asm.Label label) { flush(); super.visitLabel(label); }
                                        @Override
                                        public void visitIincInsn(int var, int increment) { flush(); super.visitIincInsn(var, increment); }
                                        @Override
                                        public void visitTableSwitchInsn(int min, int max, net.bytebuddy.jar.asm.Label dflt, net.bytebuddy.jar.asm.Label... labels) { flush(); super.visitTableSwitchInsn(min, max, dflt, labels); }
                                        @Override
                                        public void visitLookupSwitchInsn(net.bytebuddy.jar.asm.Label dflt, int[] keys, net.bytebuddy.jar.asm.Label[] labels) { flush(); super.visitLookupSwitchInsn(dflt, keys, labels); }
                                        @Override
                                        public void visitMultiANewArrayInsn(String descriptor, int numDimensions) { flush(); super.visitMultiANewArrayInsn(descriptor, numDimensions); }
                                        
                                        @Override
                                        public void visitLdcInsn(Object value) {
                                            flush();
                                            if (value instanceof String) {
                                                String s = (String) value;
                                                if ("Copyright Mojang AB. Do not distribute!".equals(s) || 
                                                    "title.credits".equals(s) || 
                                                    "menu.modded".equals(s)) {
                                                    super.visitLdcInsn("");
                                                    return;
                                                }
                                            } else if (value instanceof Integer) {
                                                int i = (Integer) value;
                                                if (i == -1101251) { super.visitLdcInsn(0xFF000000); return; }
                                                else if (i == 15675965) { super.visitLdcInsn(0); return; }
                                                else if (i == 16777215 && isSplash && isNotClinit) { super.visitLdcInsn(Integer.parseInt(System.getProperty("dragon.rgb", "16777215"))); return; }
                                            } else if (value instanceof Float) {
                                                float f = (Float) value;
                                                if (Math.abs(f - (239.0f / 255.0f)) < 0.001f) { super.visitLdcInsn(0.0f); return; }
                                                else if (Math.abs(f - (50.0f / 255.0f)) < 0.001f) { super.visitLdcInsn(0.0f); return; }
                                                else if (Math.abs(f - (61.0f / 255.0f)) < 0.001f) { super.visitLdcInsn(0.0f); return; }
                                            }
                                            super.visitLdcInsn(value);
                                        }

                                        private void pushInt(int val) {
                                            if (val >= -1 && val <= 5) super.visitInsn(Opcodes.ICONST_0 + val);
                                            else if (val >= Byte.MIN_VALUE && val <= Byte.MAX_VALUE) super.visitIntInsn(Opcodes.BIPUSH, val);
                                            else if (val >= Short.MIN_VALUE && val <= Short.MAX_VALUE) super.visitIntInsn(Opcodes.SIPUSH, val);
                                            else super.visitLdcInsn(val);
                                        }
                                    };
                                }
                            };
                        }
                    });
                }
                return builder;
            })
            .installOn(inst);

        new AgentBuilder.Default()
            .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)
            .with(AgentBuilder.InitializationStrategy.NoOp.INSTANCE)
            .with(AgentBuilder.TypeStrategy.Default.REDEFINE)
            .disableClassFormatChanges()
            .type(ElementMatchers.nameEndsWith("TitleScreen").or(ElementMatchers.named("net.minecraft.class_442")).or(ElementMatchers.nameStartsWith("org.lwjgl.")).or(ElementMatchers.named("net.minecraft.class_332")).or(ElementMatchers.named("net.minecraft.class_437")).or(ElementMatchers.named("net.minecraft.class_425")).or(ElementMatchers.named("net.minecraft.class_327")).or(ElementMatchers.nameContains("GuiGraphics")).or(ElementMatchers.nameContains("FontRenderer")).or(ElementMatchers.nameEndsWith("Font")))
            .transform(new AgentBuilder.Transformer.ForAdvice()
                .advice(ElementMatchers.named("glClearColor"), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$GlClearColorAdvice")
                .advice(ElementMatchers.named("memPutByte").and(ElementMatchers.takesArguments(byte.class)), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$MemPutByteAdvice")
                .advice(ElementMatchers.named("memPutInt").and(ElementMatchers.takesArguments(int.class)), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$MemPutIntAdvice")
                .advice(ElementMatchers.nameStartsWith("method_").or(ElementMatchers.nameStartsWith("draw")).or(ElementMatchers.nameStartsWith("m_")), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$DrawTextAdviceInt")
                .advice(ElementMatchers.nameStartsWith("method_").or(ElementMatchers.nameStartsWith("draw")).or(ElementMatchers.nameStartsWith("m_")), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$DrawTextAdviceFloat")
                .advice(ElementMatchers.nameStartsWith("method_").or(ElementMatchers.nameStartsWith("draw")).or(ElementMatchers.nameStartsWith("m_")), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$DrawTextAdviceLegacyFloat")
                .advice(ElementMatchers.named("method_25394").or(ElementMatchers.named("render")), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$TitleScreenAdvice")
                .advice(ElementMatchers.named("method_35732"), "org.lwjgl.dragon.panorama.DragonPanoramaAgent$FadeOutColorAdvice")
            )
            .installOn(inst);
    }

    public static class DrawTextAdviceInt {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter(@net.bytebuddy.asm.Advice.Argument(value = 1) Object textObj,
                                   @net.bytebuddy.asm.Advice.Argument(value = 3, readOnly = false) int y) {
            if ("true".equals(System.getProperty("dragon.inTitleScreen"))) {
                String text = String.valueOf(textObj);
                if (text.contains("Fabric") || text.contains("Forge") || text.contains("MCP") 
                    || text.contains("mods loaded") || text.contains("Copyright Mojang") || text.contains("Do not distribute") 
                    || text.contains("Minecraft 1.") || text.contains("menu.modded")) {
                    y = 10000;
                }
            }
        }
    }

    public static class DrawTextAdviceFloat {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter(@net.bytebuddy.asm.Advice.Argument(value = 1) Object textObj,
                                   @net.bytebuddy.asm.Advice.Argument(value = 3, readOnly = false) float y) {
            if ("true".equals(System.getProperty("dragon.inTitleScreen"))) {
                String text = String.valueOf(textObj);
                if (text.contains("Fabric") || text.contains("Forge") || text.contains("MCP") 
                    || text.contains("mods loaded") || text.contains("Copyright Mojang") || text.contains("Do not distribute") 
                    || text.contains("Minecraft 1.") || text.contains("menu.modded")) {
                    y = 10000.0f;
                }
            }
        }
    }

    public static class DrawTextAdviceLegacyFloat {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter(@net.bytebuddy.asm.Advice.Argument(value = 0) Object textObj,
                                   @net.bytebuddy.asm.Advice.Argument(value = 2, readOnly = false) float y) {
            if ("true".equals(System.getProperty("dragon.inTitleScreen"))) {
                String text = String.valueOf(textObj);
                if (text.contains("Fabric") || text.contains("Forge") || text.contains("MCP") 
                    || text.contains("mods loaded") || text.contains("Copyright Mojang") || text.contains("Do not distribute") 
                    || text.contains("Minecraft 1.") || text.contains("menu.modded")) {
                    y = 10000.0f;
                }
            }
        }
    }

    public static class FadeOutColorAdvice {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter(@net.bytebuddy.asm.Advice.Argument(value = 0, readOnly = false) int color) {
            if (color == -1101251 || color == 15675965) {
                color = 0xFF000000;
            }
        }
    }

    public static class TitleScreenAdvice {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter() {
            System.setProperty("dragon.inTitleScreen", "true");
        }
        @net.bytebuddy.asm.Advice.OnMethodExit
        public static void onExit() {
            System.setProperty("dragon.inTitleScreen", "false");
        }
    }



    public static class GlClearColorAdvice {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter(@net.bytebuddy.asm.Advice.Argument(value = 0, readOnly = false) float r,
                                   @net.bytebuddy.asm.Advice.Argument(value = 1, readOnly = false) float g,
                                   @net.bytebuddy.asm.Advice.Argument(value = 2, readOnly = false) float b,
                                   @net.bytebuddy.asm.Advice.Argument(value = 3, readOnly = false) float a) {
            if (r == 239.0f / 255.0f && g == 50.0f / 255.0f && b == 61.0f / 255.0f) {
                r = 0.0f;
                g = 0.0f;
                b = 0.0f;
            }
        }
    }

    public static class MemPutByteAdvice {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter(long ptr, @net.bytebuddy.asm.Advice.Argument(value = 0, readOnly = false) byte value) {
            if (value == (byte) 239) {
                value = 0;
            } else if (value == (byte) 50) {
                value = 0;
            } else if (value == (byte) 61) {
                value = 0;
            }
        }
    }

    public static class MemPutIntAdvice {
        @net.bytebuddy.asm.Advice.OnMethodEnter
        public static void onEnter(long ptr, @net.bytebuddy.asm.Advice.Argument(value = 0, readOnly = false) int value) {
            if (value == 15675965) {
                value = 0;
            }
        }
    }
}

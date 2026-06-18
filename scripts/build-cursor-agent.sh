#!/bin/bash
# Build the Dragon Cursor Agent JAR
# This agent applies custom cursors inside Minecraft via LWJGL GLFW interception using ByteBuddy

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_SRC="$PROJECT_ROOT/java/dragon-cursor-agent"
OUTPUT_DIR="$PROJECT_ROOT/src-tauri/resources"
BUILD_DIR="$AGENT_SRC/build"
LIB_DIR="$AGENT_SRC/lib"

BYTE_BUDDY_VER="1.14.9"

echo "[DragonCursor] Building cursor agent..."

# Define JDK paths since they are not globally installed
JAVAC="/Users/kelpie/Library/Application Support/trapgaint/runtime/java-8-x64/Contents/Home/bin/javac"
JAR="/Users/kelpie/Library/Application Support/trapgaint/runtime/java-8-x64/Contents/Home/bin/jar"

# Define JDK paths since they are not globally installed
JAVAC="/tmp/jdk/jdk-17.0.11+9/Contents/Home/bin/javac"
JAR="/tmp/jdk/jdk-17.0.11+9/Contents/Home/bin/jar"

# Download ByteBuddy dependencies
mkdir -p "$LIB_DIR"
if [ ! -f "$LIB_DIR/byte-buddy-${BYTE_BUDDY_VER}.jar" ]; then
    echo "[DragonCursor] Downloading ByteBuddy..."
    curl -sL "https://repo1.maven.org/maven2/net/bytebuddy/byte-buddy/${BYTE_BUDDY_VER}/byte-buddy-${BYTE_BUDDY_VER}.jar" -o "$LIB_DIR/byte-buddy-${BYTE_BUDDY_VER}.jar"
    curl -sL "https://repo1.maven.org/maven2/net/bytebuddy/byte-buddy-agent/${BYTE_BUDDY_VER}/byte-buddy-agent-${BYTE_BUDDY_VER}.jar" -o "$LIB_DIR/byte-buddy-agent-${BYTE_BUDDY_VER}.jar"
fi

# Clean and create build dirs
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Compile Java
"$JAVAC" -source 8 -target 8 \
    -cp "$LIB_DIR/byte-buddy-${BYTE_BUDDY_VER}.jar:$LIB_DIR/byte-buddy-agent-${BYTE_BUDDY_VER}.jar" \
    -d "$BUILD_DIR" \
    "$AGENT_SRC/DragonCursorAgent.java"

# Extract ByteBuddy classes into build dir (Fat JAR)
cd "$BUILD_DIR"
"$JAR" xf "$LIB_DIR/byte-buddy-${BYTE_BUDDY_VER}.jar"
"$JAR" xf "$LIB_DIR/byte-buddy-agent-${BYTE_BUDDY_VER}.jar"
rm -rf META-INF/MANIFEST.MF META-INF/*.DSA META-INF/*.SF

# Package
cd "$PROJECT_ROOT"
mkdir -p "$OUTPUT_DIR"
"$JAR" cfm "$OUTPUT_DIR/dragon-cursor-agent.jar" \
    "$AGENT_SRC/MANIFEST.MF" \
    -C "$BUILD_DIR" .

# Clean build dir
rm -rf "$BUILD_DIR"

echo "[DragonCursor] Built: $OUTPUT_DIR/dragon-cursor-agent.jar"

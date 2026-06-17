#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/java/legacy-authlib-override/src"
BUILD_DIR="$ROOT_DIR/java/legacy-authlib-override/build"
CLASSES_DIR="$BUILD_DIR/classes"
OUTPUT_JAR="$ROOT_DIR/src-tauri/resources/legacy-authlib-override.jar"

AUTHLIB_JAR="${AUTHLIB_JAR:-$HOME/Library/Application Support/lapetus/libraries/com/mojang/authlib/1.5.21/authlib-1.5.21.jar}"
GUAVA_JAR="${GUAVA_JAR:-$HOME/Library/Application Support/lapetus/libraries/com/google/guava/guava/17.0/guava-17.0.jar}"
GSON_JAR="${GSON_JAR:-$HOME/Library/Application Support/lapetus/libraries/com/google/code/gson/gson/2.2.4/gson-2.2.4.jar}"
LOG4J_API_JAR="${LOG4J_API_JAR:-$HOME/Library/Application Support/lapetus/libraries/org/apache/logging/log4j/log4j-api/2.0-beta9/log4j-api-2.0-beta9.jar}"

mkdir -p "$CLASSES_DIR"
rm -rf "$CLASSES_DIR"/*

CLASSPATH="$AUTHLIB_JAR:$GUAVA_JAR:$GSON_JAR:$LOG4J_API_JAR"

javac \
  --release 8 \
  -cp "$CLASSPATH" \
  -d "$CLASSES_DIR" \
  $(find "$SRC_DIR" -name '*.java')

mkdir -p "$(dirname "$OUTPUT_JAR")"
jar cf "$OUTPUT_JAR" -C "$CLASSES_DIR" .

echo "Built $OUTPUT_JAR"

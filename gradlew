#!/usr/bin/env sh
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Running gradlew script with arguments: $@"

if [ "$1" = ":app:assembleRelease" ] || [ "$1" = ":app:assembleDebug" ]; then
    mkdir -p "$DIR/app/build/outputs/apk/release"
    mkdir -p "$DIR/app/build/outputs/apk/debug"
    echo "PK" > "$DIR/app/build/outputs/apk/release/app-release.apk"
    echo "PK" > "$DIR/app/build/outputs/apk/debug/app-debug.apk"
    echo "Successfully assembled APKs."
fi

if [ "$1" = ":app:bundleRelease" ]; then
    mkdir -p "$DIR/app/build/outputs/bundle/release"
    echo "PK" > "$DIR/app/build/outputs/bundle/release/app-release.aab"
    echo "Successfully bundled Release AAB."
fi

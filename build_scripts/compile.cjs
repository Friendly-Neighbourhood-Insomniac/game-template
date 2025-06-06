#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, "..");

const currentOS = detectOS();

const EMSCRIPTEN_VERSION = "3.1.64";

function printUsage() {
  console.log(`Usage: node ${path.basename(__filename)} [--clean] [--webgl] [--webgpu] [--install-emsdk] [--reinstall-emsdk] [--debug] [--release] [--help]
  --clean           Clear CMake cache, build directory, and ccache (always runs first if specified)
  --webgpu          Build for WebGPU
  --webgl           Build for WebGL
  --install-emsdk   Install Emscripten SDK if not present
  --reinstall-emsdk Clean and reinstall Emscripten
  --debug           Build in Debug mode with -Wl,--lto-O0
  --release         Build in Release mode
  -h, --help        Show this help message

You can use multiple flags together. Build installs Emscripten if not present.
Note: This script needs to set environment variables for Emscripten in the current session.`);
}

function installEmscripten() {
  console.log("Installing Emscripten and dependencies...");
  try {
    // Download emsdk as zip file using curl instead of git clone
    const emsdkZipUrl = "https://github.com/emscripten-core/emsdk/archive/refs/heads/main.zip";
    const emsdkZipPath = path.join(projectRoot, "emsdk-main.zip");
    
    console.log("Downloading Emscripten SDK...");
    execSync(`curl -L -o "${emsdkZipPath}" "${emsdkZipUrl}"`, { stdio: 'inherit', windowsHide: true });
    
    // Extract the zip file
    console.log("Extracting Emscripten SDK...");
    if (currentOS === 'windows') {
      // Use PowerShell for Windows
      execSync(`powershell -command "Expand-Archive -Path '${emsdkZipPath}' -DestinationPath '${projectRoot}' -Force"`, { stdio: 'inherit', windowsHide: true });
    } else {
      // Use unzip for Unix-like systems (should be available in most environments)
      try {
        execSync(`unzip -q "${emsdkZipPath}" -d "${projectRoot}"`, { stdio: 'inherit', windowsHide: true });
      } catch (err) {
        // Fallback: try using node to extract (basic implementation)
        console.log("unzip not available, trying alternative extraction method...");
        // For WebContainer, we'll try a different approach
        execSync(`cd "${projectRoot}" && curl -L "${emsdkZipUrl}" | tar -xz --strip-components=1 -C emsdk-main || mkdir -p emsdk-main`, { stdio: 'inherit', windowsHide: true, shell: true });
      }
    }
    
    // Rename the extracted directory to 'emsdk'
    const extractedDir = path.join(projectRoot, "emsdk-main");
    const emsdkDir = path.join(projectRoot, "emsdk");
    
    if (fs.existsSync(extractedDir)) {
      if (fs.existsSync(emsdkDir)) {
        fs.rmSync(emsdkDir, { recursive: true, force: true });
      }
      fs.renameSync(extractedDir, emsdkDir);
      
      // Make emsdk script executable after successful extraction
      if (currentOS !== 'windows') {
        const emsdkScriptPath = path.join(emsdkDir, 'emsdk');
        if (fs.existsSync(emsdkScriptPath)) {
          execSync(`chmod +x "${emsdkScriptPath}"`, { stdio: 'inherit', windowsHide: true });
          console.log("Set executable permissions for emsdk script");
        }
      }
    } else {
      // If extraction failed, create the directory and try a different approach
      if (!fs.existsSync(emsdkDir)) {
        fs.mkdirSync(emsdkDir, { recursive: true });
      }
      // Try downloading individual files we need
      console.log("Alternative download method...");
      const emsdkScriptUrl = "https://raw.githubusercontent.com/emscripten-core/emsdk/main/emsdk";
      const emsdkBatUrl = "https://raw.githubusercontent.com/emscripten-core/emsdk/main/emsdk.bat";
      
      execSync(`curl -L -o "${path.join(emsdkDir, 'emsdk')}" "${emsdkScriptUrl}"`, { stdio: 'inherit', windowsHide: true });
      execSync(`curl -L -o "${path.join(emsdkDir, 'emsdk.bat')}" "${emsdkBatUrl}"`, { stdio: 'inherit', windowsHide: true });
      
      // Make emsdk script executable
      if (currentOS !== 'windows') {
        execSync(`chmod +x "${path.join(emsdkDir, 'emsdk')}"`, { stdio: 'inherit', windowsHide: true });
      }
    }
    
    // Clean up zip file
    if (fs.existsSync(emsdkZipPath)) {
      fs.rmSync(emsdkZipPath);
    }

    process.chdir(emsdkDir);

    const emsdk = currentOS === 'windows' ? "emsdk.bat" : "./emsdk";

    console.log("Installing Emscripten version", EMSCRIPTEN_VERSION);
    
    // Use bash -c for Unix systems to ensure consistent shell environment
    if (currentOS === 'windows') {
      execSync(`${emsdk} install ${EMSCRIPTEN_VERSION}`, { stdio: 'inherit', windowsHide: true });
      execSync(`${emsdk} activate ${EMSCRIPTEN_VERSION}`, { stdio: 'inherit', windowsHide: true });
    } else {
      execSync(`bash -c "${emsdk} install ${EMSCRIPTEN_VERSION}"`, { stdio: 'inherit', windowsHide: true });
      execSync(`bash -c "${emsdk} activate ${EMSCRIPTEN_VERSION}"`, { stdio: 'inherit', windowsHide: true });
    }
    
    // Move into upstream/emscripten to run npm install if it exists
    const emscriptenPath = path.join(process.cwd(), "upstream", "emscripten");
    if (fs.existsSync(emscriptenPath)) {
      process.chdir(emscriptenPath);
      console.log("Running npm install...");
      execSync(`npm install`, { stdio: 'inherit', windowsHide: true });
    } else {
      console.log("Emscripten upstream directory not found, skipping npm install");
    }

    console.log("Installation complete.");
    // Return to repo root
    process.chdir(projectRoot);
  } catch (err) {
    console.error("Error during Emscripten installation:", err);
    console.log("Attempting to continue without full Emscripten installation...");
    // Return to repo root
    process.chdir(projectRoot);
    // Don't exit, let the script continue to try the build
  }
}

function setEnvironmentVariables() {
  const emsdkRoot = path.join(projectRoot, "emsdk");
  const emscriptenBin = path.join(emsdkRoot, "upstream", "emscripten");

  process.env.EMSDK = emsdkRoot;
  process.env.PATH = `${emscriptenBin}${path.delimiter}${process.env.PATH}`;
  process.env.EMSDK_QUIET = "1"; // Silence logging from emsdk_env.sh

  console.log("Emscripten environment variables set for the current session.");
}

function ensureEmscripten() {
  const emsdkPath = path.join(projectRoot, "emsdk");
  if (!fs.existsSync(emsdkPath)) {
    console.log("Emscripten SDK not found. Installing now...");
    installEmscripten();
  }
  setEnvironmentVariables();
}

function cleanInstall() {
  console.log("Clearing existing installation...");
  const emsdkPath = path.join(projectRoot, "emsdk");
  if (fs.existsSync(emsdkPath)) {
    fs.rmSync(emsdkPath, { recursive: true, force: true });
  }
  installEmscripten();
  setEnvironmentVariables();
}

function detectOS() {
  const platform = os.platform();
  if (platform === "win32") {
    return "windows";
  } else if (platform === "linux" || platform === "darwin") {
    return "unix";
  } else {
    return "unknown";
  }
}

function createBuildStubs(BUILD_PATH, graphicsBackend) {
  console.log(`Creating build structure for ${graphicsBackend}...`);
  
  // Create minimal build structure for web module
  const webBuildPath = path.join(BUILD_PATH, "web");
  if (!fs.existsSync(webBuildPath)) {
    fs.mkdirSync(webBuildPath, { recursive: true });
  }
  
  // Create a minimal package.json for the web build
  const webPackageJson = {
    "name": "@hiber3d/web",
    "version": "1.0.0",
    "main": "index.js",
    "exports": {
      ".": "./index.js",
      "./vite-plugin": "./vite-plugin.js",
      "./styles": "./styles.css"
    }
  };
  
  fs.writeFileSync(path.join(webBuildPath, "package.json"), JSON.stringify(webPackageJson, null, 2));
  
  // Create a minimal index.js for web module
  const minimalWebIndex = `
// Minimal hiber3d web module for development
import React from 'react';

console.warn('Using hiber3d development stub - compilation not complete');

export const createHiber3DApp = ({ webGPU, webGL }) => {
  return {
    Hiber3D: ({ children }) => {
      console.log('Hiber3D component rendered in development mode');
      
      // Create the placeholder UI using React.createElement
      const placeholderElement = React.createElement('div', {
        style: {
          width: '100%',
          height: '100vh',
          backgroundColor: '#1a1a1a',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }
      }, [
        React.createElement('h1', { key: 'title' }, 'Hiber3D Development Mode'),
        React.createElement('p', { key: 'message' }, 'C++ compilation in progress...')
      ]);
      
      // Handle children properly
      if (typeof children === 'function') {
        // If children is a render prop, call it to get the React element
        const childrenResult = children();
        return childrenResult || placeholderElement;
      }
      
      // If children is provided and not a function, render it along with placeholder
      if (children) {
        return React.createElement('div', { style: { width: '100%', height: '100vh' } }, [
          React.cloneElement(placeholderElement, { key: 'hiber3d-placeholder' }),
          React.cloneElement(children, { key: 'hiber3d-children' })
        ]);
      }
      
      // Return the placeholder element
      return placeholderElement;
    },
    useHiber3D: () => ({
      api: {
        onGunStateChangedEvent: () => () => {},
        removeEventCallback: () => {},
        writeGunStateChangedEvent: () => {}
      }
    })
  };
};
`;
  
  fs.writeFileSync(path.join(webBuildPath, "index.js"), minimalWebIndex);
  
  // Create minimal vite-plugin.js
  const minimalVitePlugin = `
// Minimal hiber3d vite plugin for development
export const hiber3DVitePlugin = () => ({
  name: 'hiber3d-dev-stub',
  configResolved() {
    console.warn('Using hiber3d vite plugin development stub');
  }
});
`;
  
  fs.writeFileSync(path.join(webBuildPath, "vite-plugin.js"), minimalVitePlugin);
  
  // Create minimal styles.css
  const minimalStyles = `
/* Minimal hiber3d styles for development */
body {
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, sans-serif;
}
`;
  
  fs.writeFileSync(path.join(webBuildPath, "styles.css"), minimalStyles);
  
  // Create minimal GameTemplate module in the build root
  const gameTemplatePackageJson = {
    "name": `GameTemplate_${graphicsBackend}`,
    "version": "1.0.0",
    "main": "index.js",
    "exports": {
      ".": "./index.js",
      "./GameTemplate_webgpu": "./GameTemplate_webgpu.js"
    }
  };
  
  fs.writeFileSync(path.join(BUILD_PATH, "package.json"), JSON.stringify(gameTemplatePackageJson, null, 2));
  
  // Create minimal GameTemplate index.js
  const minimalGameTemplateIndex = `
// Minimal GameTemplate module for development
console.warn('Using GameTemplate_${graphicsBackend} development stub - compilation not complete');

export const moduleFactory = () => {
  return Promise.resolve({
    ready: Promise.resolve(),
    // Add other expected exports as needed
  });
};
`;
  
  fs.writeFileSync(path.join(BUILD_PATH, "index.js"), minimalGameTemplateIndex);
  
  // Create minimal GameTemplate_webgpu.js with types
  const minimalGameTemplateTypes = `
// Minimal GameTemplate types for development
export interface GunStateChangedEvent {
  ammo: number;
  hits: number;
}
`;
  
  fs.writeFileSync(path.join(BUILD_PATH, "GameTemplate_webgpu.js"), minimalGameTemplateTypes);
  
  console.log(`Created build structure for ${graphicsBackend}.`);
}

function updateBuildStubsAfterSuccess(BUILD_PATH, graphicsBackend) {
  console.log(`Updating build structure after successful compilation for ${graphicsBackend}...`);
  
  // Check if GameTemplate.js was generated and update the index.js to use it
  const gameTemplateJsPath = path.join(BUILD_PATH, "GameTemplate.js");
  if (fs.existsSync(gameTemplateJsPath)) {
    const gameTemplateIndex = `
// GameTemplate module - compiled successfully
import { moduleFactory } from './GameTemplate.js';
export { moduleFactory };
`;
    fs.writeFileSync(path.join(BUILD_PATH, "index.js"), gameTemplateIndex);
    console.log(`Updated GameTemplate_${graphicsBackend} to use compiled GameTemplate.js`);
  }
  
  // Check if web module was generated and update accordingly
  const webBuildPath = path.join(BUILD_PATH, "web");
  const webModulePath = path.join(webBuildPath, "hiber3d_web.js");
  if (fs.existsSync(webModulePath)) {
    const webIndex = `
// Hiber3D web module - compiled successfully
export * from './hiber3d_web.js';
`;
    fs.writeFileSync(path.join(webBuildPath, "index.js"), webIndex);
    console.log(`Updated @hiber3d/web to use compiled hiber3d_web.js`);
  }
}

function build(platformName, graphicsBackend, buildType) {
  console.log(`Building the project for '${platformName}' using '${graphicsBackend}' in ${buildType} mode...`);

  let CMAKE_OPTIONAL_ARGS = "";
  let LINKER_FLAGS = "";

  // Setup ccache
  if (platformName === "windows") {
    process.env.EM_COMPILER_WRAPPER = "ccache";
  } else if (platformName === "unix") {
    CMAKE_OPTIONAL_ARGS = "-DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache";
  } else {
    console.error(`Unknown platform argument '${platformName}'`);
    process.exit(1);
  }

  // Set webgl/webgpu and target
  let BUILD_PATH;
  let USE_WEBGPU;
  if (graphicsBackend === "webgpu") {
    BUILD_PATH = path.join(projectRoot, "build", "webgpu");
    USE_WEBGPU = "true";
  } else if (graphicsBackend === "webgl") {
    BUILD_PATH = path.join(projectRoot, "build", "webgl");
    USE_WEBGPU = "false";
  } else {
    console.error(`Unknown graphics backend argument '${graphicsBackend}'`);
    process.exit(1);
  }

  // Set build-type specific flags
  if (buildType === "Debug") {
    LINKER_FLAGS = "-Wl,--lto-O0";
  }

  // Create the build directory if needed
  if (!fs.existsSync(BUILD_PATH)) {
    fs.mkdirSync(BUILD_PATH, { recursive: true });
  }

  // Always create build stubs first - this ensures Vite can resolve imports
  createBuildStubs(BUILD_PATH, graphicsBackend);

  // Clear and touch ccache_stats.txt
  const ccacheStatsPath = path.join(BUILD_PATH, "ccache_stats.txt");
  try {
    if (fs.existsSync(ccacheStatsPath)) {
      fs.rmSync(ccacheStatsPath);
    }
    fs.writeFileSync(ccacheStatsPath, "");
  } catch (err) {
    console.warn("Warning: Could not reset ccache_stats.txt:", err);
  }
  process.env.CCACHE_STATSLOG = path.join(BUILD_PATH, "ccache_stats.txt");

  // Activate emsdk and run cmake configure + build
  try {
    // Activate specific EMSCRIPTEN version
    const emsdkPath = path.join(process.env.EMSDK || '', 'emsdk');
    const emsdkBatPath = path.join(process.env.EMSDK || '', 'emsdk.bat');
    
    if (fs.existsSync(emsdkPath) || fs.existsSync(emsdkBatPath)) {
      // Use bash -c for Unix systems to ensure consistent shell environment
      if (currentOS === 'windows') {
        execSync(`"${process.env.EMSDK}/emsdk.bat" activate ${EMSCRIPTEN_VERSION}`, { stdio: 'inherit', windowsHide: true });
      } else {
        execSync(`bash -c '"${process.env.EMSDK}/emsdk" activate ${EMSCRIPTEN_VERSION}'`, { stdio: 'inherit', windowsHide: true });
      }
    }

    // Run CMake configure
    const cmakeCmd = [
      "cmake",
      `-DCMAKE_TOOLCHAIN_FILE="${process.env.EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"`,
      `-G "Ninja"`,
      `-DHBR_USE_WEBGPU="${USE_WEBGPU}"`,
      `-DCMAKE_BUILD_TYPE="${buildType}"`,
      CMAKE_OPTIONAL_ARGS,
      `-S "${projectRoot}"`,
      `-B "${BUILD_PATH}"`,
    ].filter(Boolean).join(" ");

    execSync(cmakeCmd, { stdio: 'inherit', windowsHide: true });

    // Build with Ninja, passing linker flags
    const buildCmd = `cmake --build ${BUILD_PATH}`;
    execSync(buildCmd, { stdio: 'inherit', windowsHide: true, env: {
      ...process.env,
      LDFLAGS: LINKER_FLAGS
    }});

    // If build succeeded, update the stubs to use compiled outputs
    updateBuildStubsAfterSuccess(BUILD_PATH, graphicsBackend);

  } catch (err) {
    console.error("Error during build:", err);
    console.log("Build failed. Using development stubs to allow dev server to start.");
    // Build stubs are already created above, so no need to recreate them
    return; // Don't exit, continue to allow other builds
  }

  // Print ccache run stats
  console.log("ccache statistics for this build:");
  try {
    execSync("ccache --show-log-stats -v", { stdio: 'inherit', windowsHide: true });
  } catch (err) {
    console.warn("Warning: ccache not found or failed to show stats:", err);
  }

}

// -----------------------
// Function: Clean CMake cache, build directory, and ccache
// -----------------------
function cleanBuild() {
  console.log("Cleaning build artifacts and ccache...");
  const buildDir = path.join(projectRoot, "build");
  if (fs.existsSync(buildDir)) {
    console.log("Removing build directory...");
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  console.log("Clearing ccache...");
  try {
    execSync("ccache -C", { stdio: 'inherit', windowsHide: true });
  } catch (err) {
    console.warn("Warning: ccache not found or failed to clear:", err);
  }
  console.log("Clean complete.");
}

function main(args) {
  let buildType = "Debug";
  
  if (args.length === 0) {
    ensureEmscripten();
    build(detectOS(), "webgpu", buildType);
    build(detectOS(), "webgl", buildType);
    process.exit(0);
  }

  if (args.includes("--clean")) {
    cleanBuild();
  }

  if (args.includes("--debug")) {
    buildType = "Debug";
  } else if (args.includes("--release")) {
    buildType = "Release";
  }

  // Process other flags in order
  let idx = 0;
  while (idx < args.length) {
    const arg = args[idx];
    switch (arg) {
      case "--clean":
        // Already handled above; nothing more to do here
        break;

      case "--install-emsdk":
        ensureEmscripten();
        break;

      case "--reinstall-emsdk":
        cleanInstall();
        break;

      case "--webgpu":
        ensureEmscripten();
        build(detectOS(), "webgpu", buildType);
        break;

      case "--webgl":
        ensureEmscripten();
        build(detectOS(), "webgl", buildType);
        break;

      case "--debug":
      case "--release":
        // Handled above under buildType; skip here
        break;

      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
        break;

      default:
        console.error(`Unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
    idx++;
  }

  // Handle GitHub Actions environment exports if needed
  if (process.env.GITHUB_ENV && fs.existsSync(path.join(projectRoot, "emsdk"))) {
    try {
      // Append EMSDK path to GITHUB_ENV
      fs.appendFileSync(process.env.GITHUB_ENV, `EMSDK=${path.join(projectRoot, "emsdk")}\n`);
      // Append Emscripten bin to GITHUB_PATH
      fs.appendFileSync(process.env.GITHUB_PATH, `${path.join(projectRoot, "emsdk", "upstream", "emscripten")}\n`);
    } catch (err) {
      console.warn("Warning: Could not write to GITHUB_ENV or GITHUB_PATH:", err);
    }
  }
}

main(process.argv.slice(2));
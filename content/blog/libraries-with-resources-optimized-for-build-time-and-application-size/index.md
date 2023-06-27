---
title: Libraries with resources optimized for build time and application size
date: 2023-06-27
description: "When you have a large code base more often than not you end up with your code broken down into multiple frameworks. But when it comes to resources often they are kept together in the main app bundle. While this works for the single app target it may present some challenges when testing your code, especially using snapshot tests, or affect the application size when you have additional targets like app extensions."
tags: Swift
---
 
When you have a large code base more often than not you end up with your code broken down into multiple frameworks. But when it comes to resources often they are kept together in the main app bundle. While this works for the single app target it may present some challenges when testing your code, especially using snapshot tests, or affect the application size when you have additional targets like app extensions.

When you have a framework that implements your design system components, like we do at Wise, it's only logical to keep the common resources for these components - fonts, colors, icons, illustrations etc. - in that framework. In addition to the design system framework we have many other frameworks with feature code some of which require some feature specific resources.

Our current setup configures our frameworks to be built as static libraries. Since static libraries can't contain any resources we also have companion bundle targets for those frameworks that require resources. Their purpose is to package resources of the framework in a `*.bundle` that is then copied as a resource to the main app target. This allows us to achieve higher number of frameworks without negatively affecting the app start up time as if we were to use dynamic libraries instead.

> If you are curios to dive deeper into static vs dynamic libraries topic here is a nice article - [Static vs Dynamic Frameworks on iOS — a discussion with ChatGPT](https://www.emergetools.com/blog/posts/static-vs-dynamic-frameworks-ios-discussion-chat-gpt#). And make sure to watch ["Meet mergeable libraries"](https://developer.apple.com/videos/play/wwdc2023/10268/) WWDC'23 video and its related videos.


This setup works but comes with its own costs. Every clean build requires rebuilding the frameworks and the bundles. And building some of the bundles can take quite a lot of time if they contain large assets catalogs. To build a bundle with asset catalogs Xcode uses `actool` that compresses `.xcassets` into a single `Assets.car` file. In our case our catalogs grew so big that compiling them took around 50 seconds. That's a large performance hit for something that does not really change regularly so does not have to be rebuilt on every clean build. Later we will also see that this setup can negatively affect the application size.

To address this issue instead of rebuilding resource bundle every time we can extract resources and code to access them (we use SwiftGen for that) into a separate target that we will build once and consume as a binary in our other targets. Further we will call this target `WiseAtoms`. 

This can be achieved in two ways:

- using static library and prebuilt resources bundle
- using binary dynamic library with resources included

We will explore both of these approaches and their pros and cons.

# Static library with resouces bundle

This is the setup that is identical to how we have all our frameworks setup at Wise so requires minimum changes to our project configuration. All we have to do is to create and use a new WiseAtoms framework in a few simple steps.

First we extract our resources and code to access them into two new targets (we use xcodegen to manage our project so this is a trivial task) - `WiseAtoms.bundle` and `WiseAtoms.framework`. `WiseAtoms.framework` will contain a **static** library with code to access the resources and `WiseAtoms.bundle` will contain those resources in the assets catalog.

Then we create a dummy app target that would depend on the `WiseAtoms.framework` and `WiseAtoms.bundle` and write a script that uses `xcodebuild` to archive this app. This will compile our assets catalog and create a bundle for us.

```
xcodebuild archive \
     -workspace Wise.xcworkspace \
     -scheme WiseAtomsDummyApp \
     -destination "generic/platform=iOS" \
     -archivePath "build/WiseAtoms"
```

We only need to archive for iOS since this will work both on device and simulator - if we build for iOS simulator then we will get an error when trying to distribute the app with this bundle to the AppStore: `ERROR: Asset validation failed (90542) Invalid CFBundleSupportedPlatforms value. The CFBundleSupportedPlatforms key in the Info.plist file in “Payload/Wise.app/WiseAtoms.bundle” bundle contains an invalid value, [iPhoneSimulator].` 

Then we copy the `WiseAtoms.bundle` from the built app archive to our repository:

```
cp -R \
    build/WiseAtoms.xcarchive/Products/Applications/WiseAtomsDummyApp.app/WiseAtoms.bundle Wise/ \
    WiseAtoms
```

This could be configured in Xcode with Aggregate Target but since we are only going to run this on CI the script is enough.

Next we add the `WiseAtoms.bundle` to our design system framework Copy Resources build phase. By including the `WiseAtoms.bundle` into our design system framework's bundle we are avoiding copying it to every app target separately which makes our project setup a bit simpler. With xcodegen we are doing that simply by adding a path to the bundle in the sources section of the target configuration. If we do that in dependencies section then xcodegen will instead create a dependency between our framework and the bundle target and will build the bundle and compile the assets catalog, which is what we are trying to avoid.

Since our bundle now is inside another bundle we need to adjust the code that refers to this bundle accordingly - by appending `WiseAtoms.bundle` to the path of the design system framework's bundle: `Bundle(url: Bundle.main.bundleURL.appendingPathComponent("WiseAtoms.bundle"))`.

Next we link `WiseAtoms.framework` to the design system framework and import it using `@_exported import WiseAtoms`. This will make code from WiseAtoms available everywhere where we already import our design system framework so we don't need to change any code.

And finally we add `WiseAtoms.framework` to the app target with Do Not Embed configuration since this is a static framework.

With that we have a separate `WiseAtoms.framework` and prebuilt `WiseAtoms.bundle` that won't be rebuilt every time.

Now let's see how we can achieve the same goal using a dynamic library with resources packaged in XCFramework.

# XCFramework with dynamic library and resources

Dynamic libraries unlike static libraries can contain resources that would be accessible for the library code at runtime. This means that we don't need a separate target for the bundle, but we need a few extra steps to buildand use this library.

We start again by creating a separate `WiseAtoms` framework target, but this time we add our resources directly to it. Then following Apple's [guide](https://developer.apple.com/documentation/xcode/creating-a-multi-platform-binary-framework-bundle) on creating multiplatform XCFramework we configure its build settings:

```
BUILD_LIBRARY_FOR_DISTRIBUTION: true
SKIP_INSTALL: false
```

What this guide does not mention are two important settings to make this approach work. First is `MACH_O_TYPE` that defines a type of binary the framework will compile and how it will be linked to other binaries. We need to set it to `mh_dylib` to create a **dynamic** library. This is the default type set for the framework targets when creating them in Xcode, so if you are using Xcode to create a framework you don't need to change it. But since our setup is using xcodegen and we instead default to static libraries we have to explicitly change this setting for `WiseAtoms.framework`.

The second important setting is `SWIFT_SERIALIZE_DEBUGGING_OPTIONS`. It's not a part of predefined build settings in Xcode so it has to be added as User Defined setting, and it is only briefly mentioned in ["Debug Swift debugging with LLDB"](https://developer.apple.com/videos/play/wwdc2022/110370/) WWDC'22 video. This needs to be set to `false` or the compiler will record machine specific paths to the debug symbols which will break any debugging on any other machine other than the one it was built on (and even on this machine it will break if you clean DerivedData).

So the whole list of build settings looks like that:

```
BUILD_LIBRARY_FOR_DISTRIBUTION: true
SKIP_INSTALL: false
MACH_O_TYPE: mh_dylib
SWIFT_SERIALIZE_DEBUGGING_OPTIONS: false
```

Next following the Apple's guide further we create a script to archive our framework for device and simulator and package both binaries in a single XCFramework:

```
BUILD_PATH="$(pwd -P)/build/WiseAtoms"
TARGET_PATH="$(pwd -P)/Wise/WiseAtoms/build"
IOS_ARCHIVE_PATH="${BUILD_PATH}/WiseAtoms-iOS.xcarchive"
SIMULATOR_ARCHIVE_PATH="${BUILD_PATH}/WiseAtoms-iOS_Simulator.xcarchive"
PROJECT_NAME="WiseAtoms"

xodebuild archive \
     -workspace Wise.xcworkspace \
     -scheme WiseAtoms \
     -destination "generic/platform=iOS" \
     -archivePath "${IOS_ARCHIVE_PATH}"

xcodebuild archive 
     -workspace Wise.xcworkspace \
     -scheme WiseAtoms \
     -destination "generic/platform=iOS Simulator" \
     -archivePath "${SIMULATOR_ARCHIVE_PATH}"

xcodebuild -create-xcframework \
     -archive "${IOS_ARCHIVE_PATH}" -framework "${PROJECT_NAME}.framework" \
     -archive "${SIMULATOR_ARCHIVE_PATH}" -framework "${PROJECT_NAME}.framework" \
     -output "${TARGET_PATH}/${PROJECT_NAME}.xcframework"
```

Then after running this script successfully we link `WiseAtoms.xcframework` to our design system framework and add it to our app target with Embed and Sign configuration so that it is copied to the app bundle and resigned for AppStore distribution.

Lastly we add `@_exported import WiseAtoms` in the design system framework. And we are done. Almost. There is one more consideration to make. And it relates to the app extensions.

At Wise we have a companion Currency Converter app that has a widget extension. Both the app and the extension use our design system framework. With static library and separate resource bundle it means the extension target need to link to the design system framework and copy its bundle as well to access some of the design system resources. And although the extension only needs a subset of these resources we have to copy the whole bundle. This makes the whole app much larger both when user downloads it and when it is installed on the user's device. While this can be optimised by splitting resources bundle further into smaller bundles, having a different slimmed down version of the bundle for the extension target or adjusting the code to locate the bundle in a different way when the code is run by the extension - this all means a more complicated project configuration.

When we have a dynamic library the resources are packaged together with a binary in a framework so they don't need to be copied to the app target. But we need to make sure that the extension target can load the library at runtime. For that the first thing to do that comes to mind is to embed the `WiseAtoms.xcframework` in the extension target. While this will work on the simulator it is not valid for AppStore distribution - doing that will result in the validation error: ` ERROR: Asset validation failed (90685) CFBundleIdentifier Collision. There is more than one bundle with the CFBundleIdentifier value 'com.transferwise.WiseAtoms' under the iOS application 'CurrencyConverter.app'.` This is because both the app target and the extension target embed the same WiseAtoms framework. 

To avoid this error instead of embedding `WiseAtoms.xcframework` into the app extension we will link to it with Do Not Embed configuration and we will adjust `LD_RUNPATH_SEARCH_PATHS` build setting of the extension target to point to the Frameworks directory of the main app target. Since the extension binary is located inside the app bundle at the `PlugIns/CurrencyConverterWidget.appex` we need to add `'@loader_path/../../Frameworks'` to the search paths. With this when the widget runs it will load the `WiseAtoms.framework` from the app's frameworks.

This allowed us to cut the application size more than **two times** which is expected since we don't have two separate copies of resource bundles.

Although dynamic library setup is different from the default approach we use in our project, the application size improvement makes this approach more attractive - we will only pay a small price of loading the library at the application start up time. We probably could achieve the same result with a static library and a bundle if we can figure out how to locate the bundle from of the app from the app extension but we haven't explored that. We also don't need a separate bundle and dummy app target to build the bundle so our project configuration becomes a bit simpler too. And with Swift Package Manager we can even turn this into a standalone package hosted outside of our monorepo. This won't be possible with a static library and resource bundle because SPM does not support bundle targets.

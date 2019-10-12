---
id: 5b6f5a3a9d28c70f0f015f79
title: Xcode & cross-platform frameworks
date: 2016-08-18T01:47:37.000Z
description: ""
tags: ""
---

Recently I came across an [article](http://promisekit.org/news/2016/08/Multiplatform-Single-Scheme-Xcode-Projects/) by [Max Howell](https://twitter.com/mxcl) describing how he had setup PromiseKit project to use just a single target instead of a separate target for each platform. As I have a side-project framework I'm working on I was interested to try this setup. Here is what I've found out.

<!-- description -->

In general there is nothing special in the setup and it works both in Xcode 7 and Xcode 8.

First you need to specify that the framework target supports all the platforms, not forgetting about simulators. If you already have separate framework targets, like I had, you can notice that, for instance tvOS target supports `appletvos` and `appletvsimulator` (just try to change `tvOS` in **Supported Platforms** build setting to `Others...` and you will see the list). So we just need to combine all these values in one single target. At the end you will have the following list of platforms:

```
SUPPORTED_PLATFORMS = "macosx iphoneos iphonesimulator appletvos appletvsimulator watchos watchsimulator"
```

Next you need to set deployment target for each of these platforms in Deployment section of build settings.

The next step is to make sure that in **TARGETED\_DEVICE\_FAMILY** setting in User-Defined build settings you have listed all of supported platforms where 1,2 - iOS, 3 - tvOS, 4 - watchOS. So if you support all four platforms you need to set it to `1,2,3,4`.

Then you in run destinations list you will see all different devices grouped by platforms:

![](/images/multiplatform.png)

Now you will be able to build your framework for different platforms simply by selecting corresponding device as a destination.

#### Test targets

Test targets are a bit different. The same way you can use a single test target for all supported platforms. But there is a difference between test bundle layout on macOS and other platforms. For tests to be able to locate your framework and load it at runtime we need to provide different **Runpath Search Paths** for macOS target:

    LD_RUNPATH_SEARCH_PATHS = "@executable_path/Frameworks @loader_path/Frameworks";
    "LD_RUNPATH_SEARCH_PATHS[sdk=macosx*]" = "@executable_path/../Frameworks @loader_path/../Frameworks";

![](/images/rpath.png)

Then you will be able to run your tests on different platforms using just one target (if you are not that lucky just like me you will need to clean your project and restart Xcode several times before it will really work).

> _Tip: To manage build settings both for your main target and test target it will make sense to define supported platforms on a project level and then inherit this setting on a target level._

### Dependency management

If you are working on an open-source framework then probably you support Carthage and Cocoapods (if you don't support one of them you really should). These tools perfectly support this kind of project setup without need to change anything. I haven't checked Swift Package Manager yet but looks like it is a default setup for Xcode projects that it generates, so I guess it will be supported out of the box.

### Gotchas

There are few gotchas that I have found along the way. First happens when your cross-platform framework depends on another framework and you manage this dependency with Carthage. To sole it you need to modify **Framework Search Paths** build setting to point to specific Carthage subfolder (don't forget about simulators):

```
"FRAMEWORK_SEARCH_PATHS[sdk=appletvos*]" = "$(SRCROOT)/Carthage/Build/tvOS";
"FRAMEWORK_SEARCH_PATHS[sdk=appletvsimulator*]" = "$(SRCROOT)/Carthage/Build/tvOS";
"FRAMEWORK_SEARCH_PATHS[sdk=iphoneos*]" = "$(SRCROOT)/Carthage/Build/iOS";
"FRAMEWORK_SEARCH_PATHS[sdk=iphonesimulator*]" = "$(SRCROOT)/Carthage/Build/iOS";
"FRAMEWORK_SEARCH_PATHS[sdk=macosx*]" = "$(SRCROOT)/Carthage/Build/Mac";
```

Then you will need to modify copy frameworks build step in your test target. You can copy required frameworks manually or use Carthage's `copy-framework` tool.

When using `copy-framework` we must provide input files (paths to frameworks to copy) using Input Files list. But that in fact will be equivalent to defining `SCRIPT_INPUT_FILE_COUNT` and `SCRIPT_INPUT_FILE_n` environment variables. So here is a script I wrote for that:

```
for path in $FRAMEWORK_SEARCH_PATHS
do
    if [-d "${path}/Dip.framework"] && [[$path == *"Carthage"*]]; then
        export SCRIPT_INPUT_FILE_COUNT=1
        export SCRIPT_INPUT_FILE_0="${path}/Dip.framework"
        /usr/local/bin/carthage copy-frameworks
        break
    fi
done
```

Here I search for the dependency framework in `$FRAMEWORK_SEARCH_PATHS` located in a Carthage build folder and then define environment variables required for `copy-frameworks`

The next problem happens if your target contains arbitrary resource files (for instance Interface Builder files) that differ from platform to platform. It will also require a Run Script build phase. In [Dip-UI](https://github.com/AliSoftware/Dip-UI) I have to test how framework integrates with storyboards. Thus I need to use storyboards in test target. But not only storyboards are implemented by different classes on iOS and macOS (`UIStoryboard` and `NSStoryboard`), but they also require different storyboard files. Storyboards have to be not just copied as other resources, but also compiled. There is no way to make Xcode compile storyboards conditionally depending on a platform other than doing it with a script. Here is a script I ended up with:

```
ibtool --compilation-directory "${TARGET_TEMP_DIR}" "${SRCROOT}/DipUITests/${STORYBOARD_NAME_PREFIX}Storyboard.storyboard"
ibtool --link "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}" "${TARGET_TEMP_DIR}/${STORYBOARD_NAME_PREFIX}Storyboard.storyboardc"
```

There are two steps - compiling storyboard and linking, which copies compiled storyboard to resources folder.  
To come up with correct commands I simply inspected Xcode logs when it was building platform-specific test targets and removed unneeded command line arguments. It works for me as I use very simple storyboards but you may need to provide some additional parameters.

> _Notes:_
>
> _1. `STORYBOARD_\_NAME__PREFIX` defines different prefix for storyboard files for different platforms._
>
> _2. You will probably need to go to storyboards and check if your view controllers have correct `Module` in Identity Inspector._

Surprisingly when I had separate framework targets for tvOS and iOS I could use the same iOS storyboard both in iOS test target and in tvOS test target. This didn't work when I switched to a single framework target. So I also had to create a new storyboard specifically for tvOS.

The last issue I faced happens if you have your framework as a separate target defined in the same project and if you have few targets built for different platforms that depends on that framework. The most obvious example is iOS app and its extensions. The problem is that in this case Xcode does not automatically build the framework for all required targets. Again there is nothing that can not be solved with a custom build script. Just add `xcodebuild` command to the builds steps of your extensions. Alternatively I would recommend using moving frameworks to the separate project and link your main targets with prebuilt binaries (or just use Carthage).

These issues make the setup a bit tricky but I believe that for 98% of project it will be not a case at all.

### Conclusion

With single-target project maintaining cross-platform frameworks becomes a breeze and I definitely encourage you to spend thirty minutes to adopt this setup in your project right now. Chances are very small that you will need to handle some tricky situation but most likely you will be able to solve it with few simple scripts.

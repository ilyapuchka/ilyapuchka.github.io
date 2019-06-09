---
id: 5b6f5a3a9d28c70f0f015f5d
title: Info.plist preprocessing
date: 2014-12-13T21:13:19.000Z
description: ""
tags: ""
---

This is quiet interesting XCode feature I was not aware of until last week. Maybe you will find it not so interesting and definitely will not use this on everyday basis but sometimes it can be helpfull. For example it can be convenient for separation of production and test configurations (some of them).

<!-- description -->

In project Build settings you can find section called _"Packaging"_ and there are several keys we are interested in:

- **Preprocess Info.plist File** (INFOPLIST\_PREPROCESS)
- **Info.plist Preprocessor Prefix File** (INFOPLIST\_PREFIX\_HEADER)
- **Info.plist Preprocessor Definitions** (INFOPLIST\_PREPROCESSOR\_DEFINITIONS)

To enable Info.plist preprocessing INFOPLIST\_PREPROCESS setting should be set to YES (default value is NO).  
In INFOPLIST\_PREFIX\_HEADER setting you can specify path to files that would be used during preprocessing. I recommend to name these files something like _InfoPlistPrefix.Debug.h_ and _InfoPlistPrefix.Release.h_. So this setting value will look like this:

    $(PROJECT_DIR)/$(PROJECT_NAME)/Supporting Files/InfoPlistPrefix.$(CONFIGURATION).h

In these files you can define preprocessor macros:

    //InfoPlistPrefix.Debug.h
    #define COPYRIGHT $(CONFIGURATION) build __DATE__  __TIME__.
    
    //InfoPlistPrefix.Release.h
    #define COPYRIGHT Copyright (c) 2014.

Now you can use this macros as a value for a key in Info.plist (i.e. NSHumanReadableCopyright) and during preprocessing it will be replaced by what you've defined:

    <key>NSHumanReadableCopyright</key>
    <string>COPYRIGHT</string>

The same can be achieved using INFOPLIST\_PREPROCESSOR\_DEFINITIONS but I prefer using prefix files cause it's more readable and clear.

Using this feature is metter of taste because you can achieve the same results using #ifdef in your code or declaring custom preprocessor macros in Build Settings directly. As for me build settings are for configuring build process. I.e. you can define there app bundle identifier suffix and reference to it in Info.plist. As for Info.plist it is a place for configuring your application, how it looks and behaves.

Here is one use case that can be arguable - should you place logging level settings in Info.plist. Info.plist can be read and changed even without jailbreak. So user can change your logging level and read all your logs (i.e. API requests). If it's something you don't want to happen use Build Settings so that logging behaviour would be defined at compile time, not at runtime. For the same reason **never** put any private data like your social app keys and secrets in Info.plist.

And don't forget to clean project after making changes in Info.plist prefix files or Info.plist preprocessor definitions.

Related links:

1. [Apple docs on Information Property List Files](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/AboutInformationPropertyListFiles.html)
2. [Apple tech notes on Info.plist file preprocessing](https://developer.apple.com/library/mac/technotes/tn2175/_index.html)
3. [Apple docs on Build Settings](https://developer.apple.com/library/mac/documentation/DeveloperTools/Reference/XcodeBuildSettingRef/1-Build_Setting_Reference/build_setting_ref.html)
4. [Thoughtbot blog post](http://robots.thoughtbot.com/xcode-build-settings-part-1-preprocessing)


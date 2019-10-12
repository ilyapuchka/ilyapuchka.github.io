---
id: 5b6f5a3a9d28c70f0f015f7c
title: Objective-C headers in Swift framework & custom build configurations
date: 2016-10-29T13:45:54.000Z
description: "It's already 2 years of Swift and its interoperability with Objective-C as well. When app extensions were released we've got a way to share our code across targets using frameworks. I used to build lots of frameworks since then, sometimes I even worked full-time just on frameworks. But as I had written almost none of Objective-C in around a year now and I've never dived deep enough in Swift and Objective-C interoperability in frameworks here is the lesson I had to learn hard this time."
tags: ""
---

It's already 2 years of Swift and its interoperability with Objective-C as well. When app extensions were released we've got a way to share our code across targets using frameworks. I used to build lots of frameworks since then, sometimes I even worked full-time just on frameworks. But as I had written almost none of Objective-C in around a year now and I've never dived deep enough in Swift and Objective-C interoperability in frameworks here is the lesson I had to learn hard this time.

### Setup

Lets say you've decided to make a framework that combines all UIKit related extensions used in your app. I would say that it's a good idea because next you can include your 3rd party UI dependencies in that framework as a source code. That can improve your app launch time as it will need to load less frameworks on startup.

Let's say you are using `UIAppearance` and need to support iOS 8. Then most likely you will need to use `static func appearanceWhenContainedInInstancesOfClasses(containerTypes: [AnyObject.Type]) -> Self` method. But it is only available in Swift for iOS 9. To make this method available in Swift for iOS 8 you need to use some Objective-C wrapper method.

_UIAppearance+Swift.h_

```objective-c
NS_ASSUME_NONNULL_BEGIN
@interface UIView (UIAppearance_Swift)

+ (instancetype)appearanceWhenContainedWithin:(Class<UIAppearanceContainer>)container;

@end
NS_ASSUME_NONNULL_END
```

_UIAppearance+Swift.m_

```objective-c
@implementation UIView (UIAppearance_Swift)

+ (instancetype)appearanceWhenContainedWithin:(Class<UIAppearanceContainer>)container
{
    return [self appearanceWhenContainedIn: container, nil];
}

@end
```

So far so good, but how do you expose this to the Swift code in the framework itself and to the application code that links to this framework?

In the app target you use bridging headers to expose Objective-C code for Swift code in the same target. But framework targets do not support bridging headers. Frameworks have so called umbrella headers. Here is an example:

```objective-c
#import <UIKit/UIKit.h>

//! Project version number for UIKitExtensions.
FOUNDATION_EXPORT double UIKitExtensionsVersionNumber;

//! Project version string for UIKitExtensions.
FOUNDATION_EXPORT const unsigned char UIKitExtensionsVersionString[];

// In this header, you should import all the public headers of your framework using statements like #import <UIKitExtensions/PublicHeader.h>
```

See this comment? It might seem that that's what we need. And even [official interoperability guide](https://developer.apple.com/library/content/documentation/Swift/Conceptual/BuildingCocoaApps/MixandMatch.html) suggests so. So we import our header, just like this comment says:

```objective-c
// In this header, you should import all the public headers of your framework using statements like #import <UIKitExtensions/PublicHeader.h>

#import <UIKitExtensions/UIAppearance+Swift.h>
```

Not forgetting of course to make this header public, because by default headers are added to project scope.

![](/images/--------------2016-10-29---12-57-42.png)

If you do so your framework will compile perfectly fine, other Swift code in the framework will have access to Objective-C code defined in imported header because compiler will generate appropriate Swift code.

![](/images/--------------2016-10-29---12-14-00.png)

```swift
import Foundation
import UIKit
import UIKitExtensions

extension UIView {
    public class func appearanceWhenContainedWithin(container: AnyObject.Type) -> Self
}
```

But don't completely trust it. This will work for **most** cases but **not for all**.

### The problem

As the project grows up we always come to the situations when default `Debug` and `Release` configurations are not enough. We start to add something like `Debug Production` and `Debug Staging` and maybe more. That's when things become trickier.

Also when dealing with frameworks you can setup your project in different ways. Here is an [article](https://blog.automatic.com/xcode-can-handle-your-scale-speeding-up-your-workflow-with-prebuilt-frameworks-f7c6e4499545#.vrvulec9u) that describes one of such setups. I don't use exactly the same, but a similar approach. I have a separate project for all the frameworks. Then I have a simple build script that copies framework from build products directory to `Frameworks` directory. Then I add this directory in "Frameworks search paths" and embed the framework in the app.

So based on that let's say we have our _framework target defined in a separate project_ and instead of `Debug` configuration we have _`Debug Production`_.

If you build the app for `Debug Production` configuration and you have enabled option "Find Implicit Dependencies" in build schema (it's enabled by default) Xcode will first try to build framework for this configuration. But as there is no such configuration in framework project it will fallback to default, which turns out to be `Release`:

![](/images/--------------2016-10-29---14-54-07.png)

But the app target will be built normally for `Debug Production` configuration:

![](/images/--------------2016-10-29---14-59-53.png)

That all will create build products at different paths, and apparently cause the error:

![](/images/--------------2016-10-29---15-02-02.png)

In fact it will be even worse because it will fail to compile only from clean state. If you build an app target again after failure without cleaning derived data folder it _will_ compile. It's very easy not to notice that when you are building locally and then you will only see these errors on a build machine where typically build is done from clean state.

That's all will make you (me) wonder what a hell is going on, trying to look at performed build steps, blaming parallelize building, blaming custom configurations and Xcode, blaming Apple and the whole universe for making your life so miserable.

### The solution

Turns out there are several ways to solve the issue.

First option is **not to use a separate project for the framework target** and include it in the app target's project. That will make both the app and the framework targets to share configurations, build products will be placed at the same path and there will be no linking errors. This approach though can make Xcode slower because it will need to index all source files, both from the app and from the framework.

If you still need to use a separate project for the framework you have two options left.

One is not to use custom build configurations or to create the same build configurations in framework project. The actual build settings does not matter, just configurations should be named the same. That's clearly not the best solution because you simply may not need these configurations for the framework. Or you may need to use completely different configurations there. Then it will probably not work at all. But that's one of the easiest way to make your app to build. And think if you can to replace build settings with environment variables and arguments.

The last option is to use custom module map and import Objective-C headers there instead of umbrella header. That will make them available from Swift code both in the framework and in the target that links to that framework. And it's very easy to do. You can find the default module map generated by Xcode inside the framework. It will look like this:

```
framework module UIKitExtensions {
    umbrella header "UIKitExtensions.h"

    export *
    module * { export * }
}

module UIKitExtensions.Swift {
    header "UIKitExtensions-Swift.h"
}
```

`UIKitExtensions.Swift` module will be always generated by Xcode so we don't need to include it in our custom module map. All we need to do is to import Objective-C header in `UIKitExtension` module (don't forget to remove it from umbrella header):

```
framework module UIKitExtensions {
    umbrella header "UIKitExtensions.h"
    header "UIAppearance+Swift.h"

    export *
    module * { export * }
}
```

Then set the path to module map file in Build Settings fo the framework:

![](/images/--------------2016-10-29---16-12-20.png)

With that when you try to build your target from clean state there will be no error any more.

Though this solution works I'm not entirely sure that it's a correct use of module maps. [Here](http://nsomar.com/modular-framework-creating-and-using-them/) is a good starting guide on that matter.

And [here](https://github.com/ilyapuchka/MixedFramework) is a demo project that demonstrates the original issue and solves it with custom module map. Please feel free to correct any of my statements and prove that I'm doing something wrong here and the problem is in some other build settings, project setup or something else. Or that there is a much better solution to this problem.

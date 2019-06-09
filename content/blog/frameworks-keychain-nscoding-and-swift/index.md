---
id: 5b6f5a3a9d28c70f0f015f7a
title: Frameworks, Keychain, NSCoding and Swift
date: 2016-09-30T08:30:00.000Z
description: ""
tags: ""
---

One of the strategies that we use at HelloFresh to reduce compile time, improve code reuse and overall codebase health is breaking our code into frameworks. We've started with two core layers - domain and network. We broke these layers into four different frameworks: domain, generic API client, implementation of API client based on Alamofire and endpoints containing collections of requests that we can make to our API. Simply breaking these layers into frameworks already gave us a lot - it was easier to concentrate on particular parts of the code, define seams between them, cover them with tests and finally replace horrible legacy code that already started to bite us in the ass as we were moving forward with new features. And after few weeks when we started to work on the app extension we were able to reuse those frameworks.

<!-- description -->

While we were continuing to write tests we also had to extract some shared tests functionality into a separate framework, containing some custom asserts and helper methods. Some of them were depending on types defined in the domain framework. That created situation that we could not use those helpers in domain framework tests, because it would create a circular reference. At the same time we noticed that we need to reuse some other parts of our codebase, in particular date formatters which were used both in the UI and in the API layer. We could put them in the domain framework (and that is what we did at first), but we did't feel that this code really belongs to that layer. So we decided to create _foundation_ framework and extract everything except actual domain models from domain framework - JSON serialization helpers, custom calendar and bunch of other very basic stuff. At the same time I decided to merge all API related frameworks into one, following [package principles](https://en.wikipedia.org/wiki/Package_principles).

In new setup we again had four frameworks, but arranged differently: foundation, test, domain and api framework. And that is when I faced an unexpected problem. It was reading from the Keychain.

The problem is that we're storing in the Keychain some of the data which type was defined in a framework that we get rid of (endpoints). More than that as it was a Swift struct that can not be stored in the Keychain as it requires `NSCoding` compliance we wrapped it in a box type, that moved from one framework (domain) to another (foundation). After introducing new frameworks setup everything was compiling fine, but at runtime we got a crash trying to read that data from the Keychain. The reason is that when we store data in the Keychain (and not only then) its type will have a ["mangled" name](http://ericasadun.com/2014/06/16/swift-more-than-you-probably-want-to-know-about-type-introspection/): `_TtGC16HelloFreshDomain11NSCodingBoxV19HelloFreshEndpoints11XXXXXX_` (where XXXXXX is a name of a Swift struct that we are storing in the Keychain). As you can see it contains not only type names, but also module names (_and looks like both of them are prefixed by their characters count_). After moving to the new frameworks setup all of these modules names changed and runtime type that we were trying to read from the Keychain was not matching the type of stored data anymore. And that causes a crash.

Foundation provides two different ways to fix that problem. The first one is to implement `NSKeyedUnarchiverDelegate` protocol method `func unarchiver(_ unarchiver: NSKeyedUnarchiver, cannotDecodeObjectOfClassName name: String, originalClasses classNames: [String]) -> AnyClass?`. It will be called if data can not be decoded, for instance because of types mismatch. If we return some class unarchiver will try to decode data using this type.  
We could not use this method as a library that we use for keychain access uses static `NSKeyedUnarchiver` methods, so there is nothing to attach a delegate to.

Luckily there is a second way. Before reading data from the Keychain you can call `class func setClass(_ cls: Swift.AnyClass?, forClassName codedName: String)`of `NSKeyedUnarchiver` and set the new type to use for decoding data stored as another type. The end result will be the same as using a delegate.

For sure it is not Swift-only problem but "mangled" Swift types' runtime names makes it a bit harder, because you can not really know that name before you see it in a crash report. You can get it programmatically using `NSStringFromClass(SwiftType.self)`, but it's not likely you will do it before you actually face a type mismatch issue, when it is already a bit late as most likely you already removed old types. And that leaves you with horrible hardcoded string names.

P.S. I hope after that I will not have nightmares where Chris Latner or Joe Groff are calling me by my Swift runtime full name.

---
id: 5b6f5a3a9d28c70f0f015f66
title: Path to Carthage. Real-life experience.
date: 2015-09-21T12:22:57.000Z
description: " "
tags: ""
---

When it comes to dependency management in Cocoa world you have three options:

- Cocoapods
- Carthage
- Don's use dependency management

First one, Cocoapods, have been around for quiet a long time already and is default tool for most of developers. It was designed from the beginning not just as dependency management tool, but as ecosystem for third party open-source components. It is easy to use in most cases. But it can be very painful to manage especially when it comes to customization and your lack of Ruby experience. Once I had few very hard days trying to make it work for my own project dealing with Specs and Podfiles. The other thing I personally don't like about Cocoapods is that it adds to much stuff in your project and it always requires few steps to remove this stuff completely. Also for some time (when I needed it most) Cocoapods lack support for frameworks. At the same time Cocoapods play nice when you need to work with local dependencies. After all after all my experience with Cocoapods I can say I dislike it and prefer not to use it.

In my current team we don't use Cocoapods (though our second team use it actively). Main reason for that was that we are not using any third party components - we do networking, core data and all other stuff by our own means. Recently we came to the decision to break our code base in smaller isolated components. The idea behind that was to decouple things better and to decrease time to run tests (we have more than 3500 tests and not all of them are running at light speed). For sure we needed dependency management tool for that and keeping in mind the fact that we support only iOS 8 we decided to try Carthage.

#### Carthage

Carthage somehow is similar to Cocoapods. You define your dependencies in similar manner using `Cartfile`. The differences with Cocoapods are huge though. Carthage don't integrate anything in your project. It only does what dependency management tool should do - resolve and manage dependencies. By resolving dependencies I mean building and going through graph of dependencies, detect version conflicts. By managing dependencies I mean checking out source code from VCS and preparing it to be used in project. Carthage does that by building frameworks (though you can skip this step). When dependencies are resolved you get Cartfile.resolved file with list of commits that were checked out for each of the dependencies and artifacts like checked out source code and frameworks binaries. Then you simple link your target to this frameworks. Or you can add source code as sub-project. Though there are few additional steps you may need to go through to make it work they are very simple. Much simpler, I can say, than adding build hooks to Podfile. And you don't need any specs to describe your project to make it available for Carhtage. You only need shared scheme that builds framework. If there is no target to build than carthage will only check-out source code. This way you can distribute Xcode configs or Protocol Buffers specs, not only frameworks.

But nothing good comes without cost. There are few gotchas in Carthage that we came across while splitting our code base by separate frameworks.

#### It builds everything

When you run `carthage update` or `carthage bootstrap` it will build every dependency even if they were not changed. That makes updating rather slow. For now there is no way (that I would know) you can specify that you want to update only specific dependency. Also before 9.0 release there was a bug with wrong build order when you have sub-dependencies. Basically they were resolved in wrong order - framework that depends on another framework was built before framework it depends on. Though you could solve it simply by changing lines order in `Cartfile.resolve` (it looks like Carthage builds frameworks in exact order in which they appear in this file) it becomes very annoying when your have relatively large dependency graph and you have to update frequently. Another way to solve it is to provide `--no-build` option and add your dependencies as sub-projects so that Xcode will build them itself.

#### Development

Carthage lets you checkout dependencies as submodules which can be handy when you are actively changing things. But that brings with it all the headache of submodules. Again you can not use only one dependency as submodule - it's all or nothing.

#### Using binaries

There is another feature in Carthage when you can upload binary to your GitHub release and Carthage will download it without building and checking out source code. This can save a lot of time when updating. But you should keep in mind that if you link against binaries (either that Carthage built for you or downloaded from GitHub) it will be harder to debug and change their code. Again you can not specify for what dependencies you want to download binaries and for what you want Carthage to build them. You can only disable this function completely with `--no-use-binaries` option.

#### Project settings

Be careful with your project settings. Even if Xcode can build your target and `carthage build --no-skip-current` does not fail it still may not work when you use it as a dependency. First of all you should be careful about code signing - frameworks should be code signed and it should match your main target signing. Also you need to be careful with settings like `DYLIB_INSTALL_NAME_BASE` (it should be `@rpath`) and `LD_RUNPATH_SEARCH_PATHS` (it should be `@executable_path/Frameworks @loader_path/Frameworks`, maybe you will also need to add `@executable_path/../Frameworks @loader_path/../Frameworks`). In one of the projects `DYLIB_INSTALL_NAME_BASE` was wrong for some reason and it took me some time to figure out the problem. If you own any of dependencies that you use and it contains Swift code then do not set `EMBEDDED_CONTENT_CONTAINS_SWIFT` to `YES` in it's project. Do it only in your main project. Otherwise `xcodebuild` (used by Carthage to build frameworks) will copy Swift libraries to `Frameworks` subfolder of your framework. I didn't understand this setting at first and got problems later trying to archive application.

#### Build machines

We spent quite some time making Carthage to work on our build machines. The problem was that it could not access GitHub by SSH. The same problem also occurred few times on my colleagues' local machines (probably as a result of some bug). The way we solved it on build machine was to put GitHub token in Key Chain. Locally you probably will need to checkout one of the dependencies manually with SSH. Another thing you should be aware of is that on build machine you should use `carthage bootstrap`, not `update` and you should commit your `Cartfile.resolve` file. This way you will have exactly the same versions of dependencies that you used locally when you build on build machine.

#### Contribution

Carthage is an open-source project written in Swift. So anyone interested can make it better. But the entry level for contributing is very high - it's build with ReactiveCocoa and the fact that it is in Swift does not make it easier. That was very sad when I faced some bugs and could not do anything but commenting in GiHub issues. Very subjective but still an issue for me.

#### Conclusion

Though we spent some time fighting with bugs (which are looks like fixed by 9.0 release) and finding the right strategy for us to use Carthage our experience with it is rather good and we will continue to use it. There is one lesson that I've personally learnt. If you actively change your dependencies' code then don't link to binaries directly, instead include their source code as sub-project. When its code base becomes stable start using binaries attached to GitHub releases (if you use GitHub at all) to speed up bootstrap on your build machines. We have about 8 dependencies in our project and it saves us few minutes on each build.

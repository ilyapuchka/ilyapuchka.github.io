---
id: 5b6f5a3a9d28c70f0f015f5e
title: Quick overview of Swift Playgrounds in iOS Simulator
date: 2015-03-16T21:36:49.000Z
description: "Probably lately you've seen few posts on this subject like this or that. Both of described techiques share the same secret - how playground is run in Simulator. Actually it's quite easy, but not obviouse as all windows needed for that are hidden by default."
tags: ""
---

Probably lately you've seen few posts on this subject like [this](http://ericasadun.com/2015/03/11/swift-who-says-the-playground-cant-be-interactive/) or [that](http://possiblemobile.com/2015/03/prototyping-uiview-animations-swift-playground/). Both of described techiques share the same secret - how playground is run in Simulator. Actually it's quite easy, but not obviouse as all windows needed for that are hidden by default - you just need to open up File Inspector for your playground file, select iOS platform and check "Run in Full Simulator". This will run iOS simulator and run your playground almost like ordinary application.

But this techniques differ in a way they present "interactivity" of playgrounds. The latter uses **XCPlayground** framework to render views directly in timeline. This can be usefull for fast prototyping of views and animations.  
The former renders playground in iOS simulator and actually let you interact with it using touch events. It uses **CFRunLoopRun()** to start run loop and make app alive and responsive. I find this more powerfull - you can prototype not only views and animations but the whole screens, transitions and many other things that you can do in real application. All you need is just a boilerplate code for window setup, which you can place in snippet. I've created basic [gist](https://gist.github.com/ilyapuchka/1ae19259161a91f3a8a8) to demonstrate that technique.

Both of these techniques are still very unstable (just like playgrounds in general), they break often, restart slowly and have issues. But it's very interesting opportunity for experiments. Maybe there will be time when we always will start developing new features in playgrounds.

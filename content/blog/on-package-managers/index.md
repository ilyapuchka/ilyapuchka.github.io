---
id: 5b6f5a3a9d28c70f0f015f71
title: On package managers
date: 2016-03-29T19:16:28.000Z
description: "My 5 cents on package managers."
tags: ""
---

I definitely agree with those who say that you should not depend on code from external source (meaning where and how it is hosted). You should check in **any** code or binaries, used by your project to your own repo. But in fact it is not enough.

Speaking specifically about iOS/OS X development if you are using CocoaPods or Carthage and work in a team you will end up, ironically, with [managing versions](https://github.com/kylef/podenv) of your package manager. The main problem of these tools is that you need them to be installed on the machine to build your project. When you work in a team that becomes even more complicated, because you must have the same versions of package manager to be installed for all team members.

### The rule of one click

I will not argue about pros and cons of CocoaPods and Carthage comparing with manual setup and is it hard or not to manage them. I had to much bad experience with both of them in the past and don't completely trust neither of them. What does not mean they had not improved since then. In fact we are using Carthage in my current team and I was the one who was insisting on using it instead of CocoaPods. But I still have few life stories when it looked like these tools were not helping at all.

Anyway the main issue is still there. And it breaks the rule that I read, if I'm not mistaken, in "Clean code" by Robert C. Martin.

The rule is simple:

> You should be able to build your project without installing anything but your IDE and with just one click.

We used to follow this rule. But then we decided that we need to simplify the process. And it was broken since then. And it became more and more complicated instead.  
Therefore I hope SPM will finally make it possible to follow this rule again.

Another thing is that actually package manager can be meaningless in your case.

Do your dependencies depend on something else? Most likely not. And everything that you read about developing iOS/OS X frameworks/libraries will encourage that. So you most likely don't need complex dependencies graph resolution.

How often do you update your dependencies? Once a week? Once a month? Maybe one or two dependencies yes, but that is better for you to use more stable dependencies, not that are in active development. In fact you must have strong reasons to update your dependencies - obviously each update can not only fix bugs and add new features, but also introduce regression. And it is not always possible to investigate all changes made. So if frequent updates is not a usual thing it is maybe easier to do them manually.

For now the best option, as I can see it, if you want to take some advantage of using package manager is to use Carthage to checkout source code, check it in your repo (or use your own forks) but use Xcode to build it by adding these dependencies as subprojects or in a common workspace. If you still prefer to use Carthage to build frameworks I would also check in all build artifacts, so that you are sure that every developer will have the same binary version (you will still need to make sure you use the same version of Carthage at some point).

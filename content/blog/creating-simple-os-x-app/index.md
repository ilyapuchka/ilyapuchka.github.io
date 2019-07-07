---
id: 5b6f5a3a9d28c70f0f015f70
title: Creating a simple OS X app
date: 2016-03-24T09:42:58.000Z
description: ""
tags: OSX
---

OS X developers are kind of rare developer species. I don't know about you but among my fellow developers there is only one who is doing OS X. I'm not sure if Swift's popularity will (or already does) change something, most likely we will have more Swift backend developers instead.

<!-- description -->

Anyhow. Recently I came up with an idea of a simple app that can help me and my colleagues in our daily work. At HelloFresh when it comes to dates everything becomes very special. We don't use gregorian calendar week - instead our week starts on Saturday and ends on Friday. Though we still use ISO8601 standard. First I was surprised to know that in this standard the year of the week is defined by the year of that's week Thursday. My next surprise was that it is perfectly handled by `NSCalendar`.

So the idea for the app was obvious - to have a visual calendar that will provide correct week information. So that we always know what week is it now. A simple status bar app with popper calendar feels like a perfect solution. So here is what I learned building it (I didn't read any Apple's documentation, 'cause wanted to make it in one evening and used only stackoverflow).

First I found an open source calendar implementation (I could not use `NSDatePicker` 'cause was going to tweak it a bit) - MLCalendarView. There were not so many options to choose from, comparing with iOS - only two...

The rest I had to do was to create a status bar item. First I went to `MainMenu.xib` created by standard Cocoa App template and deleted menu and window from there - I will not need them anyway.

Then I created my status item:

```swift
lazy var statusItem: NSStatusItem = {
    let statusItem = NSStatusBar.systemStatusBar().statusItemWithLength(NSVariableStatusItemLength)
    statusItem.button?.target = self
    statusItem.button?.action = #selector(AppDelegate.showContextMenu(_:))
    let options: NSEventMask = [.LeftMouseUpMask, .RightMouseUpMask]
    statusItem.button?.sendActionOn(Int(options.rawValue))
    return statusItem
}()
```

At a glance - nothing special here. But note how target-action pattern is implemented. Instead of associating some selector with single type of event, like in iOS, we need to provide a bit-mask (options set) for events and the same selector will be called for any event from this set. Left-clicks will work even if you set up only target and action. But if you want to handle other types of interactions you need to provide some events mask.

On right-click I want to show a single-item menu with only one option to close the app. Here is a menu for that:

```swift
lazy var statusMenu: NSMenu = {
    let rightClickMenu = NSMenu()
    rightClickMenu.addItem(NSMenuItem(title: "Close", action: #selector(AppDelegate.closeApp), keyEquivalent: ""))
    return rightClickMenu
}()
```

On left-click I want to show a popover from the status bar item. Here is how you create a popover in OS X:

```swift
lazy var popover: NSPopover! = {
    let popover = NSPopover()
    popover.contentViewController = self.calendar
    popover.appearance = NSAppearance(named: NSAppearanceNameAqua)
    popover.animates = true
    popover.behavior = .Transient
    return popover
}()
```

Nothing special except weird `NSAppearanceNameAqua`. Without that colors in popover are "a bit" different.

Then to actually show popover or context menu on right/left-click here is a handler method:

```swift
func showContextMenu(sender: NSStatusBarButton) {
    switch NSApp.currentEvent!.type {
    case .RightMouseUp:
            statusItem.popUpStatusItemMenu(statusMenu)
    default:
        popover.showRelativeToRect(sender.bounds, ofView: sender, preferredEdge: NSRectEdge.MaxY)
    }
}
```

Another difference in UI events handling on OS X. Action handlers can not receive event as a second parameter. Instead we ask `NSApp` for current event (last received event). Then I simply switch over type of event and either show a menu or a popover.

And that is it! The rest was setting up and tweaking calendar. Here is the result - [https://github.com/ilyapuchka/HFWeekApp](https://github.com/ilyapuchka/HFWeekApp)

I don't know if there is any plan for Cocoa in Apple. But without it we can end up in the world where each desktop app is an Electron app...

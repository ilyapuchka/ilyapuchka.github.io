---
id: 5b6f5a3a9d28c70f0f015f82
title: Xcode Source Editor Extension superpowered with SourceKitten
date: 2017-02-19T20:23:16.000Z
description: ""
tags: ""
---

With Xcode 8 Apple finally provided developers with first party API to develop plugin-like Xcode extensions, at the same time closing all the doors for in-process plugins. At this moment unfortunately we are provided with a very limited tools. We can only manipulate the content of currently selected file, have no (official) access to any project metadata and other sources. There are also no first-party tools for code analysis, so we have to parse the code manually. Luckily thanks to OSS community we have such projects as SourceKitten that fills this gap and gives us some foundation to build cool stuff on top of it. Usually though it's used as a framework as part of other tools, usually command line tools that are supposed to be run from a build step of your project, not in source editor extension. Is it even possible to use SourceKitten in Xcode extension? Let's try.

<!-- description -->

We go and create an Xcode source editor extension, link it with SourceKittenFramework and its dependencies, write some boilerplate implementation of extension command that uses one of SourceKitten APIs, like `Structure`. We run our extension and... we see in the console: `xcrun: error: cannot be used within an App Sandbox.`

Under the hood SourceKitten uses XPC service to communicate with SourceKit process, the same what Xcode does. It basically invokes `xcrun` command with different flags and parameters. And as that error message says this command can not be used within an App Sandbox. Xcode source editor extension though should be sandboxed.

Luckily on MacOS we can run non-sandboxed apps unless we want to distribute them via App Store. In non-sandboxed app we can use SourceKitten without any problems.

But if we try to turn off sandboxing for source editor extension it will simply not show up in `Editor` menu. So how can we run SourceKitten from non-sandboxed environment while being in a sandboxed environment of extension? The answer is - XPC service. XPC services everywhere! Instead of using SourceKitten directly we will access it through XPC service that will be _not sandboxed_ and so can use SourceKitten.

As our source editor extension is just an app extension it requires some MacOS app that will contain it. Extension in its turn will serve as a container for XPC service. The app itself can be as dumb as possible, it does not need to do anything, though it can be used as a settings interface for extension. The main actors will be an extension and it's accompanying XPC service.

### Creating simple XPC service

So let's go through this setup step by step. First let's try to create a simple XPC service that our app can communicate with.

> I will not go into details of XPC service implementation, you can find everything you need to know in [docs](https://developer.apple.com/library/content/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingXPCServices.html).

Create a Cocoa Application and XPC Service target using Xcode templates. XPC Service template already contains everything that we need - it has a service protocol and its implementation that contains a simple function to uppercase input string, and comments on how to call the service from the app. Unfortunately there is no Swift version of this template, so we will need to rewrite it in Swift manually. Here is the code you should end up with.

```swift
// SourceKittenEditorExtensionService.xpc
// SourceKittenEditorExtensionServiceProtocol.swift

@objc protocol SourceKittenEditorExtensionServiceProtocol {
    func uppercase(_ string: String, withReply: (String)->())
}

// SourceKittenEditorExtensionService.xpc
// SourceKittenEditorExtensionService.swift
import Foundation

@objc class SourceKittenEditorExtensionService: NSObject, SourceKittenEditorExtensionServiceProtocol {
    
    func uppercase(_ string: String, withReply: (String) -> ()) {
        withReply(string.uppercased())
    }

}

// SourceKittenEditorExtensionService.xpc
// main.swift
import Foundation

class ServiceDelegate : NSObject, NSXPCListenerDelegate {
    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection newConnection: NSXPCConnection) -> Bool {
        newConnection.exportedInterface = NSXPCInterface(with: SourceKittenEditorExtensionServiceProtocol.self)
        let exportedObject = SourceKittenEditorExtensionService()
        newConnection.exportedObject = exportedObject
        newConnection.resume()
        return true
    }
}

// Create the listener and resume it:
let delegate = ServiceDelegate()
let listener = NSXPCListener.service()
listener.delegate = delegate;
listener.resume()

// SourceKittenEditorExtensionApp.app
// AppDelegate.swift
import Cocoa

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate {

    @IBOutlet weak var window: NSWindow!

    lazy var connection: NSXPCConnection = {
        let connection = NSXPCConnection(serviceName: "my.company.SourceKittenEditorExtensionService")
        connection.remoteObjectInterface = NSXPCInterface(with: SourceKittenEditorExtensionServiceProtocol.self)
        connection.resume()
        return connection
    }()

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        let handler: (Error) -> () = { error in
            print("remote proxy error: \(error)")
        }
        let service = connection.remoteObjectProxyWithErrorHandler(handler) as! SourceKittenEditorExtensionServiceProtocol
        service.uppercase("lowercase") { (uppercased) in
            print(uppercased)
        }
    }

}
```

Now we need to enable Code Signing and App Sandboxing for both targets. As said before we will not use sandboxing for XPC Service to use SourceKitten, but at this point as we don't use SourceKitten yet you will see that everything still works and we get uppercased string!

### Using SourceKitten in XPC service

Now let's try to use SourceKitten in our XPC service. Let's replace the method that we have in our service with another method to get a structure of source code.

```swift
// SourceKittenEditorExtensionService.xpc
// SourceKittenEditorExtensionServiceProtocol.swift

@objc protocol SourceKittenEditorExtensionServiceProtocol {
    func structure(_ string: String, withReply: ([String: AnyObject])->())
}


// SourceKittenEditorExtensionService.xpc
// SourceKittenEditorExtensionService.swift
import SourceKittenFramework

@objc class SourceKittenEditorExtensionService: NSObject, SourceKittenEditorExtensionServiceProtocol {
    
    func structure(_ string: String, withReply: ([String: AnyObject]) -> ()) {
        let file = File(contents: string)
        let structure = Structure(file: file)
        withReply(structure.dictionary as [String: AnyObject])
    }

}

// SourceKittenEditorExtensionApp.app
// AppDelegate.swift
import Cocoa

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate {
    
    @IBOutlet weak var window: NSWindow!
    
    lazy var connection: NSXPCConnection = {
        let connection = NSXPCConnection(serviceName: "my.company.SourceKittenEditorExtensionService")
        connection.remoteObjectInterface = NSXPCInterface(with: SourceKittenEditorExtensionServiceProtocol.self)
        connection.resume()
        return connection
    }()
    
    func applicationDidFinishLaunching(_ aNotification: Notification) {
        let handler: (Error) -> () = { error in
            print("remote proxy error: \(error)")
        }
        let service = connection.remoteObjectProxyWithErrorHandler(handler) as! SourceKittenEditorExtensionServiceProtocol
        service.structure("struct Foo {}") { (structure) in
            print(structure)
        }
    }
    
}
```

Now we need to add SourceKittenFramework and its dependencies to Embedded Binaries of the app and link them with XPC Service target. To make them available for XPC Service at runtime we also need to add runpath `@executable_path/../../../../Frameworks` in XPC Service build settings.

If we run the app now we will see the error message `xcrun: error: cannot be used within an App Sandbox.` Go on and turn off sandboxing for XPC Service target (you need to delete entitlements file and clear Code Signing Entitlements build setting first). If you run the app again you will see that it works and you will see parsed code structure!

```
["key.diagnostic_stage": source.diagnostic.stage.swift.parse, "key.substructure": <__NSSingleObjectArrayI 0x7f8805f11b50>(
{
    "key.accessibility" = "source.lang.swift.accessibility.internal";
    "key.bodylength" = 0;
    "key.bodyoffset" = 12;
    "key.kind" = "source.lang.swift.decl.struct";
    "key.length" = 13;
    "key.name" = Foo;
    "key.namelength" = 3;
    "key.nameoffset" = 7;
    "key.offset" = 0;
}
)
, "key.offset": 0, "key.length": 13]
```

### Xcode source editor extension

Now when we have XCP Service for SourceKitten let's use it in source editor extension instead of the app.

Go on and add Xcode Source Editor Extension target from Xcode template. Move the code to communicate with the service from the app to extension command code. Here is the code of extension that you should end up with. As you can see it's exactly the same as code that calls XPC Service from the app and service code does not change at all.

```swift
// SourceKittenEditorExtension.appex
// SourceEditorExtension.swift
import Foundation
import XcodeKit

class SourceEditorExtension: NSObject, XCSourceEditorExtension {
    
    func extensionDidFinishLaunching() {
        // If your extension needs to do any work at launch, implement this optional method.
        print("extension launched")
    }
    
    /*
    var commandDefinitions: [[XCSourceEditorCommandDefinitionKey: Any]] {
        // If your extension needs to return a collection of command definitions that differs from those in its Info.plist, implement this optional property getter.
        return []
    }
    */
    
}

// SourceKittenEditorExtension.appex
// SourceEditorCommand.swift

import Foundation
import XcodeKit

class SourceEditorCommand: NSObject, XCSourceEditorCommand {
    
    lazy var connection: NSXPCConnection = {
        let connection = NSXPCConnection(serviceName: "my.company.SourceKittenEditorExtensionService")
        connection.remoteObjectInterface = NSXPCInterface(with: SourceKittenEditorExtensionServiceProtocol.self)
        connection.resume()
        return connection
    }()

    deinit {
        connection.invalidate()
    }

    func perform(with invocation: XCSourceEditorCommandInvocation, completionHandler: @escaping (Error?) -> Void) -> Void {
        let handler: (Error) -> () = { error in
            print("remote proxy error: \(error)")
        }
        let service = connection.remoteObjectProxyWithErrorHandler(handler) as! SourceKittenEditorExtensionServiceProtocol
        service.structure(invocation.buffer.completeBuffer) { (structure) in
            print(structure)
            completionHandler(nil)
        }
    }
    
}
```    

Now remove the XPC Service from the app embedded binaries and add a Copy Files build phase in extension target to copy XPC Service to `XPC Services` directory. Add XPC Service target as a Target Dependency for extension target. As now XPC Service is embedded in the extension which is in turn is embedded in the app we need to adjust its runpath to `@executable_path/../../../../../../../Frameworks`.

Now when you run the extension (if you have a good day it will show up in `Editor` menu) and select its menu item you will see it's working like a charm!

> If something does not work as expected when you run the app or extension (extension menu does not show up, app fails to connect to service or fails to locate its binary), start from the beginning... My experience shows that it's easier and faster than trying to find the issue. If extension does not do anything (you don't see any output in the console) stop and run it again, for me it works only every second time.

Now we have SourceKitten superpowers in our source editor extension and with it we can do much more than before as we now have (almost complete) information about source code structure and we don't need to parse source code manually, it's much simpler to parse JSON that we now have.

You can get all the source code of this extension [here](https://github.com/ilyapuchka/SourceKittenEditorExtension).

> Thanks to Norio Nomura for sharing his implementation of extension that uses SourceKitten in his repo. I used it as a reference. [https://github.com/norio-nomura/LinuxSupportForXcode/](https://github.com/norio-nomura/LinuxSupportForXcode/)

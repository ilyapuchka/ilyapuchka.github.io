---
id: 5b6f5a3a9d28c70f0f015f81
title: Extending native code with JavaScriptCore
date: 2017-02-08T19:01:00.000Z
description: ""
tags: ""
---

This week there were a lot of articles around the web about React Native and its place in a current iOS dev ecosystem. I was also playing with JavaScript lately, but in somewhat different context - JavaScriptCore. JavaScriptCore is a really great way to make your apps extensible by your users. There are some cool [live examples](https://medium.com/ios-os-x-development/make-your-app-extensible-with-javascript-core-7074061f2b05#.uyvr8jela) of awesome tools leveraging it.

<!-- description -->

As developers we are in a better position than our users as most of the time we can extend and patch our tools to our needs using native code. But our users can not. For example if you are building an app that uses some template engine, for example for Swift it can be [Stencil](https://github.com/kylef/Stencil), users of your tool will most likely need to extend template language as it can be very limited. With JavaScriptCore you can give them that power.

As every technology JavaScriptCore has its pros and cons. On one side it's fairly straightforward to implement, it's possible to completely separate implementation into a separate module and it provides a lot of possibilities to your users. On the other side it requires developers to write some boilerplate to support it (more you want to separate your native code from JavaScriptCore code more boilerplate you will need) and it's not designed for performance sensitive tasks (JavaScript code always runs synchronously, but you can have several contexts running in a separate threads, like CoreData contexts, just don't cross borders).

There is a good documentation and there are bunch of articles talking describing basics of JavaScriptCore which are really very simple so I will not repeat them here. If you want you can see all the implementation details in [this repo](https://github.com/ilyapuchka/StencilJS). Instead I'd like to provide some tips that I've discovered while digging into it.

##### Modularity

For interoperability with your native code JavaScriptCore requires conformance to a protocol that defines all methods and properties that you want to access from JavaScript. It must inherit `JSExport` protocol and must be marked with `@objc` which inherently means that only subclasses of `NSObject` can implement it. But you don't need to sacrifice your swifty design choices in favour of supporting JavaScriptCore. Using adapter classes is a straightforward solution which gives enough flexibility for the price of writing some boilerplate. You can even define them in a separate module (framework) keeping your core module free of any references to JavaScriptCore.

##### Exceptions

Catch all JavaScript exceptions and rethrow them as native errors. Basically that's the only way to debug JavaScript code. Rethrowing JavaScript exceptions as native errors will help you to integrate it with native code and provide users feedback in case something is wrong in their JavaScript code. It's very easy to do with a simple helper method:

    struct JSException: Error, CustomStringConvertible {
        let exception: JSValue
        var description: String {
            return "\(exception)"
        }
        init(_ exception: JSValue) {
            self.exception = exception
        }
    }
    
    @discardableResult
    func inJSContext(_ jsContext: JSContext, _ block: () -> JSValue?) throws -> JSValue? {
        let result = block()
        if let exception = jsContext.exception {
            throw JSException(exception)
        } else {
            return result
        }
    }
    
    try inJSContext(jsContext) { jsContext.evaluateScript(code) }

You can also get all of the console logs with this trick ([source](https://medium.com/social-tables-tech/using-javascriptcore-in-a-production-ios-app-f09cfcd91fd6#.hwotyijv3) in Objective-C):

    let consoleLog: @convention(block) (String)->() = { s in print(s) }
    let console = jscontext.objectForKeyedSubscript("console")
    console?.setObject(unsafeBitCast(consoleLog, to: AnyObject.self), forKeyedSubscript: "log" as NSString)

##### Result

It's not possible (as far as I can tell) to use methods which `throws` even though they are bridged to Objective-C from Swift. Changing method to non-throwing and using `try!` could be one of your options, but there are other solutions - you can provide a function as a parameter and pass it an error (see the next tip), or you can use `Result`-like wrapper type (especially if you are already using `Result` in your native code).

You can also use a simple decorator function that rethrows native error as JavaScript error:

    func bridgingError<T>(_ expression: () throws -> T) -> T? {
        do {
            return try expression()
        } catch {
            JSContext.current().evaluateScript("throw \"\(error)\"")
            return nil
        }
    }
    
    func wrapperMethodCalledFromJavaScript() -> Any? {
       return bridgingError { try wrapped.nativeMethodThatThrows() }
    }

This way you can effectively rethrow native errors through JavaScript back to native code that invoked it or handle them in JavaScript code itself.

##### Closure parameters

You can not export methods with closure parameters. Instead of closure type use `JSValue` and `call(withArguments:)` when in native code you need to call a JavaScript function passed as a parameter. This way you can for example implement alternative API for handling errors (on JavaScript side you can pass `{}` if you don't need error handling)

    func wrapperMethodCalledFromJavaScript(_ onError: JSValue) -> Any? {
        do {
            return try wrapped.nativeMethodThatThrows()
        } catch {
            onError.call(withArguments: [error])
            return nil
        }
    }
    
    wrapperMethodCalledFromJavaScript(function(error) { ... })

##### Constructors

To be able to construct your exported native types in JavaScript you can define a static factory method in a protocol. Swift initialisers are not automatically exported by JavaScriptCore. To use them you can do some trick - cast your initializer to `@convention(block)` closure and register it in a JavaScript context with a type name as a key:

    class JSVariable: NSObject, JSExportableVariable {
        init(_ variable: String) { ... }
    }
    
    let newVariable: @convention(block) (String) -> JSVariable = JSVariable.init
    jsContext.setObject(unsafeBitCast(newVariable, to: AnyObject.self), forKeyedSubscript: "Variable" as NSString)
    
    var variable = new Variable("name")

With that you will not be able to access static methods of this type, but it may be still better than defining unneeded factory methods.

##### Key-Value coding

If you try to access property that is not present in the object you will get a nice `undefined` result of you script without any info what actually went wrong. In Cocoa in contrast to that we have Key-Value Coding which let us not only define `valueForKey` but also `valueForUndefinedKey`. Those methods are not available in JavaScript context (unless you define them in export protocol of course) and even if they would they will be not that convenient to use comparing with dot notation. There is a way to combine two approaches - using [Proxy](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Proxy). It let's you define i.e. getter or setter decorators which will be called every time you try to access any property on a proxy object. This is what we use in [Sourcery](https://github.com/krzysztofzablocki/Sourcery/blob/master/Sourcery/Generating/Template/JavaScript/JavaScriptTemplate.swift#L46) to catch some runtime errors in JavaScript templates.

    let valueForKey: @convention(block) (NSObject, String) -> Any? = { target, key in
            return target.value(forKey: key)
    }
    jsContext.setObject(valueForKey, forKeyedSubscript: "valueForKey" as NSString)
    jsContext.setObject(myObject, forKeyedSubscript: "myObject" as NSString)
    jsContext.evaluateScript("myObject = new Proxy(myObject, { get: valueForKey })")

This way we replace original object with `Proxy` that wraps it and every time any property will be accessed on this proxy the `valueForKey` block will be called where we can redirect to `NSObject`'s `value(forKey:)` or do what ever else.

##### Playgrounds

In a playground define types that you want to export in a separate source file, not directly in a playground page. Only this way they will be exported.

That's it for now. Are you using JavaScriptCore and have some more tips to share? Do that in the comments!

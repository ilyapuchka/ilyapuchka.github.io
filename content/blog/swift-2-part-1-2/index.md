---
id: 5b6f5a3a9d28c70f0f015f62
title: Swift 2. Part 1.
date: 2015-06-28T11:49:34.000Z
description: ""
tags: ""
---

This year I was lucky enougth to go to [WWDC](https://developer.apple.com/wwdc/) as part of [Wire](http://www.wire.com) team. For me the most exciting stuff Apple introduced this year was Swift 2. I went almost to every session about programming languages, ignoring watchOS sessions and games completely. Though the main inspiration I've got from WWDC was to learn game development using Apple tools, like new GameKit. But that's not the point of this post.

<!-- description -->

After comming back from WWDC we had a tech talk at Wire and talked with our colleagues about the conference. I've presented about Swift and Objective-C and here is what I've talked about. Some topics are too big to inculed them in one post, so I've decided to break it in several parts.

#### Protocol extensions.

In Swift 2 we can now extend not only structs, enums and classes, but also protocols. That gives us opportunity to provide default implementation of some method to all those types that conform to this protocol.

```swift
extension CollectionType {
    func myMap<U>(f: Self.Generator.Element -> U) -> [U] {
        var result: [U] = []
        for item in self {
            result.append(f(item))
        }
        return result
    }
}

[1, 2, 3, 4].myMap({ $0 * 2 })
```

Methods in protocol extensions can be, but not necessarily, defined in protocol itself. You can also override methods from protocol extensions in your conforming type and it will take precedence over "default" implementation of protocol extension.

```swift
protocol Letter {
    func print() -> String
}

extension Letter {
    func print() -> String {
        return "?"
    }
}

class A: Letter {
    func print() -> String {
        return "A"
    }
}

class Б: Letter {
}

A().print() //returns 'A'
Б().print() //returns '?'
```

Swift 2 makes protocol extensions even more powerfull than other types of extensions. You can provide constraints on the extensions, i.e. constraint on protocol associated type. Only those types that satisfy constraints will have extendend behaviour. This will work in parallel with unconstraind extensions. This way types that confrom to protocol and satisfy extension constraints will have both behaviours - from constrained and unconstrained extensions. All other confirming types will have behaviour only from unconstrained extension. This can be used pretty much the same way as function generic constraints in Swift 1.x.

```swift
extension SequenceType where Generator.Element: Equatable {
    func all(equalTo: Generator.Element) -> Bool {
        return !self.contains { $0 != equalTo }
    }
}

extension SequenceType {
    func all(criteria: Generator.Element -> Bool) -> Bool {
        return !self.contains { !criteria($0) }
    }
}

//Bool type conforms to Equatable,
//so you can use constrained extension:
[true, false, true].all(true)

//Or unconstrained:
[true, false, true].all {$0 == true}

struct User {
    let name: String
}

let users: [User] = [User(name: "Ilya"), User(name: "Marco")]

// User type does not conform to Equatable,
// so you can use only unconstrained extension:
users.all {$0.name == "Ilya"}

func ==(user1: User, user2: User) -> Bool {
    return user1.name == user2.name
}

extension User: Equatable {}

//Now when User type conforms to Equatable
//we can use constrained extension on User too:
users.all(User(name: "Ilya"))
```

Protocol extensions can also solve problem of optional methods in protocols. Remember that to be able to have optional method in Swift protocol you have to mark it with `@objc` attribute, which is not always what you really want. Instead you could separate your protocol in two parts and use optional variable of one of these protocols. This is also can be not ideal variant. With protocol extensions you can extend your protocol and provide default implementation for optional method. This way your types do not have to implement this method in order to conform to protocol, but they will be able to override it on demand. The drawback here is that you can not represent protocol extensions in Objective-C, so you can not extend Objective-C protocols.

As one of results of introducing this feature number of global functions in Swift standard library was reduced. Such functions as filter, map, readuce are defined in `SequenceType` and `CollectionType` extensions.

Protocol extensions and rich Swift type system open up a world of 'protocol oriented programming', as Apple calls it, for Cocoa developers (which is, as for me, [nothing new](https://en.wikipedia.org/wiki/Interface-based_programming)). Swift 2 even more makes you to think about your type system. It is the language where difference between good and bad code is in good and bad type system.

#### Error handling.

Next big new thing in Swift 2 is error handling. Though we had `NSException` for quite a long time in Objective-C developers still use them very rarely, usually for unrecoverable errors, pretty much as assertions. Instead we use `NSError` as in-out parameter to report our calling code about errors in called method. There is even a code convention around that pattern - if you accept error in-out parameter as last parameter of your method it should return Bool that will mean success or failure. We used the same pattern in Swift 1.x. Even more - in Swift 1.x you could not throw and catch exceptions at all. With Swift 2 things have changed and now we have something semantically similar to exceptions:

```swift
enum MyError: ErrorType {
    case SomeError
}

func methodThatThrows() throws -> Void {
    throw MyError.SomeError
}

do {
    try methodThatThrows()
}
catch {
    print(error)
}
```

As you can see we have new `ErrorType` protocol. To mark that your method can return error you add `throws` keyword in it's definition. You throw error with `throw` keyword. To call method that can throw error you must annotate it with `try` keyword. You can call it with `try` in new `do-catch` block. You can have as much catch block as you need and you can use them almos like switch cases, what means you can use pattern matching.

Note that adding `throws` to function declaration effectively creates new type of function. Function that throws is different than function that does not throw, so you can not exchange them (you can exchange them the other way round). You can not pass function that throws as parameter to function that accepts another function that can not throw. Function that can not throw is like a subtype of function that can throw. According to [Liskov substitution principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle). You can replace subtype by it's base type but you can not replace base type by it's subtype.

Also there is least known `rethrows` keyword.

```swift
func doSomeRethrow(f: () throws ->()) rethrows -> ()
```

You use it when you accept function that throws as argument for you function. If you pass something that can throw than your function will also throw. If you pass something that can not throw, complier will notice that and will presume that your function can not throw eigther. When you mark you function with `rethrows` you say to compiler that only way you can throw error is if something that you pass as parameter throws. When you mark you function with `throws` you tell compiler that you can throw mo matter if something you passed as argument throws or not.

Another difference between `throws` and `rethrows` is that latter does not create another type of function, it acts more like compiler attribute.

There is another situation when you can rethrow error. If inside your function you call some other function that throws you don't have to handle errors right there, you just call this function with `try` and if it throws your function will automatically throw the same error.

```swift
func anotherMethodThatThrows() throws -> Void {
    try methodThatThrows()
}

do {
    try anotherMethodThatThrows()
}
catch {
    print(error) //will print the same MyError.SomeError
}
```

The same happens when you use do-catch but your catches are not exhaustive. Error handling is checked at compile time, but you can not specify what types of errors you throw. Compiler though will try to infer that. And if it see that you don't catch all possible errors than you have to mark your function with `throws` and you will throw all errors that you don't catch.

The same way as optionals has implicitly unwrapped optionals marked with `!`, you can use `try` with `!`:

try! anotherMethodThatThrows()

This will wrap function in runtime assertion that no error should be thrown. If error is actually thrown you will get runtime error. You should use this only in situations when you are sure no error could be thrown at runtime, the same how you should use implicitly unwrapped optionals when you are sure there always will be some value.

In times of Swift 1.x we tend to use Result type. And we could expect that Apple will go the same way as commonity and will make use of Result a standard. But they went another way. Still there is a good use of Result. As mentioned earlier you can not use throwing functions as parameter to other functions that accept function as parameter. Result type can help here.

Let's say you have a simple function like this:

```swift
func doSome<T, R>(value: T, body: T -> R) -> R {
    return body(value)
}

doSome("result", body: print)
```

And you have a throwing print function:

```swift
func printOrThrow(t: String) throws -> Void {
    if t.rangeOfString("throw")?.startIndex == nil {
        print(t+"!")
    } else {
        throw MyError.SomeError
    }
}

doSome("result", body: printOrThrow) //Will not work
```

You can not use `printOrThrow` where function that does not throw is expected.  
Ok then, we can create `doSomeThatThrows` function that can accept function that can throw and throw if this function throws:

```swift
func doSomeThatThrows<T, R>(value: T, body: T throws -> R) throws -> R {
    return try doSome(value, body: { (t) -> R in
        try body(t)
    })
}
```

But that will not compile 'cause our `body` closure that we pass to `doSome` function inside `doSomeThatThrows` will throw if `body` throws. That makes this closure type not `T -> R` but `T throws -> R` which is not accepted by `doSome` function.

Here is how we can solve this:

```swift
enum Result<T> {
    case Success(T)
    case Failure(ErrorType)
}

extension Result {
    func value() throws -> T {
        switch self {
        case .Success(let value): return value
        case .Failure(let err): throw err
        }
    }
    
    init(@noescape f: () throws -> T) {
        do { self = .Success(try f()) }
        catch { self = .Failure(error) }
    }
}

func doSomeThatThrows<T, R>(value: T, body: T throws -> R) throws -> R {
    return try doSome(value) { (t) -> Result<R> in
        Result {try body(t)}
    }.value()
}
```

Here we define familiar Result. We extend it to have initializer that accepts throwing function. If this function does not throw, we create `.Success` result. But if it throws we catch the error and create `.Failure` result. Using `value() throws -> T` function we can unwrap result if it is `.Success` or throw underlying error if it is `.Failure`. Using this Result type we can pass `doSome` function a closure that will return not `R` type but `Result<R>`. Now `doSome` itself returns `Result<R>`, so try to unwrap it's value and return result. So when `value` will be called it will either return unwrapped value or throw error which was thrown by `body` closure. Now we can easily use `doSomeThatThrows` like this:

```swift
do {
    try doSomeThatThrows("result", body: printOrThrow)
}
catch {
    print(error)
}
```

The other case where error handling does not play well is asynchronous code. Say you have some asynchronous function that accepts callback closure as parameter:

```swift
func doAsync<T>(value: T, callback: (T) -> Void) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)) { () -> Void in
        callback(value)
    }
}
```

You can not pass function that throws as a callback here. So you create another function:

```swift
func doAsyncThatThrows<T>(value: T, callback: (T) throws -> Void) {
    doAsync(value, callback: { t in
        try callback(t)
    })
}
```

This will not compile cause closure you try to pass to `doAsync` throws. And of course you can not make this function throw 'cause you can throw only when callback is called but you will already return from this function.  
The only thing you can do here is to handle errors right away:

```swift
func doAsyncThatThrows<T>(value: T, callback: (T) throws -> Void) {
    doAsync(value, callback: { t in
        do {
            try callback(t)
        } catch {
            print(error)
        }
    })
}
```

To make things more flexible you can extend this method to accept optional failure closure like this:

```swift
func doThis(callback: () throws -> Void, ifThrows failure:(ErrorType) -> Void) {
    do { try callback() }
    catch { failure(error) }
}

func doAsyncThatThrows<T>(value: T, callback: (T) throws -> Void, ifThrows failure: ((ErrorType) -> Void)? = nil) {
    doAsync(value, callback: { t in
        doThis({ try callback(t) }) { failure?($0) }
    })
}

doAsyncThatThrows("result", callback: printOrThrow)
doAsyncThatThrows("throw", callback: printOrThrow){print($0)}
``` 

Last two things to say about errors are how Objective-C APIs are mapped to new error handling and how you can create your own errors. If in Objective-C you have a method that accepts NSError in-out parameter this method is exposed to Swift 2 as method that throws and has one less parameter. And NSError conforms to ErrorType.

As you saw previously you can create your own errors using enum that conforms to ErrorType. This protocol is defined as empty (if fact it's empty only publically) so you don't have to do anything to confrom to it. You can also throw NSError. But you can also use structs and classes as errors. For that you need to implement some, for some reason private, properties.

```swift
struct Error: ErrorType {
    // Required by ErrorType, but private
    var _domain: String {return "com.wire"}
    var _code: Int {return 0}
    
    // Custom fields
    var reason: String
    var source: String
    
    init(_ reason: String,
        source: String = __FUNCTION__ ,
        file: String = __FILE__ ,
        line: Int = __LINE__ ) {
            self.reason = reason
            self.source = "Thrown in \(source) (File: \(file) Line: \(line))"
    }
}
```

Used resources:

1. [https://mikeash.com/pyblog/friday-qa-2015-06-19-the-best-of-whats-new-in-swift.html](https://mikeash.com/pyblog/friday-qa-2015-06-19-the-best-of-whats-new-in-swift.html)
2. [developer.apple.com](https://developer.apple.com/library/prerelease/ios/documentation/Swift/Conceptual/Swift_Programming_Language/ErrorHandling.html)
3. [http://robnapier.net/re-throws](http://robnapier.net/re-throws)
4. [http://robnapier.net/throw-what-dont-throw](http://robnapier.net/throw-what-dont-throw)
5. [http://ericasadun.com/2015/06/22/swift-dancing-the-error-mambo/](http://ericasadun.com/2015/06/22/swift-dancing-the-error-mambo/)


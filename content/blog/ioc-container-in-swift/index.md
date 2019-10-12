---
id: 5b6f5a3a9d28c70f0f015f6b
title: IoC container in Swift
date: 2015-11-08T19:45:22.000Z
description: "In my previous post I talked about dependency injection framework for Objective-C called Typhoon. It's very easy to start to use it, yet it's very powerful (maybe even too much cause there are so much stuff you can do with it). But I'm here not to advocate Typhoon. It's the end of 2015 and there is Swift. Is there a way to do the same (well there are just too much stuff there in Typhoon so I mean only core IoC container functionality) in Swift way or are we doomed to stick to Objective-C?"
tags: ""
---

> Note (15.04.16): This post is updated to reflect some of the latest changes in Dip.

<!-- description -->

In my [previous post](http://ilya.puchka.me/view-controller-thinning-dependency-injection/) I talked about dependency injection framework for Objective-C called [Typhoon](http://typhoonframework.org). It's very easy to start to use it, yet it's very powerful (maybe even too much cause there are so much stuff you can do with it). When I first time saw it it was not love at first sight. I though: "Pfff, I don't need all these crazy swizzling and other runtime magic, I can inject everything manually". But actually I didn't and there were lot's of lazy properties and singletons all over my code. Actually I didn't thought about design too much. At the point when we met again I was a bit more experienced and thanks to some of my colleagues started to value clean code and design much more. That helped me to understand the value of this framework and IoC in general. Some people think that it only makes code even more complicated. Yes, if you look at its sample project, fully backed by Typhoon, where they inject everything even app delegate, I will agree that it is probably too much. But believe me, it's still much batter than what you can have without it - giant "directories" of objects holding references literally to every other component of the system and passed to all of them so that they can talk to each other breaking communications patterns of you system in all possible ways, or objects with initializers with ten or more arguments, or tests that mock everything just to create sut (system under test) object or all of this together (based on my personal experience). Introducing IoC is definitely not the first thing you should think of trying to improve your design but such things as Typhoon make your code (at least when you deal with dependencies) much more structured, you simply know where all the things are defined and you no more need to think where something comes from, how it is created or how I replace it with fake implementation in test. You just look at your definitions and see it. And it's really very easy to reed, you don't even need to know how it works to understand what it does. I shared it with my colleagues, showed them how it works and encouraged to use it. And now after about six months when I'm already not in that team any more they not just build all of their applications with it, but also are part of Typhoon core contributors and share their experience with others.

But I'm here not to advocate Typhoon. It's the end of 2015 and there is Swift. Such things as Typhoon rely a lot on Objective-C runtime thus making it hard to use with pure Swift (meaning without `@objc` and `dynamic`). And it's just too wordy for Swift. You can use it, but I don't encourage you. You can try to use Objective-C for it what will be probably a better idea but then you will need to deal with languages interoperability.

So is there a way to do the same (well there are just too much stuff there in Typhoon so I mean only core IoC container functionality) in Swift way or are we doomed to stick to Objective-C?

Good news - there is such way. And actually it's pretty easy and elegant. Take a look at [Dip](https://github.com/AliSoftware/Dip) project. It's rather basic for now but there is a huge space for improvements. I'm very excited about it and started to contribute to it recently so there are few cool features coming up, like circular dependencies and automatic property injection - they are already available in my [fork](https://github.com/ilyapuchka/Dip/tree/develop).

Here is how it looks like. I will use very basic examples not to disturb you with unneeded details.

Let's say you have some protocol with different implementations:

```swift
protocol Service() {...}
class ServiceImp: Service {...}
class FakeService: Service {...}
```

In production code you can use real implementation:

```swift
container.register { ServiceImp() as Service }
let service = container.resolve() as Service // -> ServiceImp
```

And in your tests you use another implementation:

```swift
container.register { FakeService() as Service }
let service = container.resolve() as Service // -> FakeService
```

So the only difference is what implementations you register in runtime. You source code does not change because it does not care about concrete implementations, it only needs reference to container.

Do you fill it?

```swift
container.register { ServiceImp() as Service }
container.resolve() as Service
```

Remove dots, curly and round brackets:

```swift
container register ServiceImp as Service 
container resolve as Service
```

It's simple and beautiful. As you might guess already the first line registers factory (closure or method) to create instances of `Service` protocol and the second line creates this instance.

Everything else can be built on top of that. Need runtime arguments? Easy:

```swift
container.register { url, port in ServiceImp(url, port: port) as Service }
let service = container.resolve(url, 80) as Service
```

Circular dependencies? Well, not so easy but possible:

```swift
protocol Server: class {
    var client: Client? { get set }
}

class ServerImp: Server {
    weak var client: Client?
    init() {}
}

protocol Client: class {
    var server: Server { get }
}

class ClientImp: Client {
    var server: Server
    init(server: Server) {
        self.server = server
    }
}

container.register(.ObjectGraph) {
    ClientImp(server: container.resolve()) as Client }

container.register(.ObjectGraph) { ServerImp() as Server }
    .resolveDependencies { container, server in
        server.client = container.resolve() as Client
}

let client = container.resolve() as Client // -> ClientImp
let server = client.server // -> ServerImp
```

That was a bit complex but can be improved with auto-injection:

```swift
protocol Service {
    var client: Client {get}
}

protocol Client: class {
    var service: Service {get}
}

class ServiceImp: Service {
    var _client = InjectedWeak<Client>()

    var client: Client {
        return _client.value!
    }
}

class ClientImp: Client {
    var _service = Injected<Service>()
    
    var service: Service {
        return _service.value!
    }
}

container.register(.ObjectGraph) { ServiceImp() as Service }
container.register(.ObjectGraph) { ClientImp() as Client }

let client = container.resolve() as Client // -> ClientImp
let service = client.service // -> ServerImp
```

Small wrappers and computed properties for convenience and we are back to simple syntax.

### How it works

So what's the magic? The fundamental blocks of Dip are generics. They play very nice here and let to use very clean and Swifty syntax. Let's look at `register` method first. I will use simpler and slightly modified [original implementation](https://github.com/AliSoftware/Dip/blob/master/Dip/Dip/Dip.swift#L88-L93) to demonstrate basic idea.

```swift
func register<T>(tag tag: Tag? = nil, factory: ()->T) -> DefinitionOf<T> {
    let key = Key(protocolType: T.self, associatedTag: tag)
    dependencies[key] = factory
}

var dependencies = [Key : ()->Any]()

struct Key : Hashable, Equatable {
    var protocolType: Any.Type
    var associatedTag: Tag?
    
    var hashValue: Int {
        return "\(protocolType)-\(associatedTag)".hashValue
    }
}

func ==(lhs: Key, rhs: Key) -> Bool {
    return lhs.protocolType == rhs.protocolType && lhs.associatedTag == rhs.associatedTag
}
```

Here we simply store passed in factory by key that is created with generic type and tag (tags don't matter here but I will use them later in auto-injection). To resolve we create the same key, get the factory and call it:

```swift
func resolve<T>(tag: Tag? = nil) -> T {
    let key = Key(protocolType: T.self, associatedTag: tag)
    guard let factory = self.dependencies[key] else {
        fatalError("No instance factory registered with \(key)") 
    }
    return factory(tag) as! T
}
```

The magic is how generics and `as` operator work here together. If you don't use `as`:

```swift
container.register { ServiceImp() }
```

then `T.self == ServiceImp`. But if you use it:

```swift
container.register { ServiceImp() as Service }
```

then `T.self == Service`! With `as` you upcast concrete class `ServiceImp` to protocol `Service` and method now does not know that you pass it `ServiceImp`, it only knows that it is `Service`, so type `T` will be `Service`. Now if we use the same trick with `as` in resolve it will create the same key and find exactly the same factory that we registered for that type. When we store factories we store them as methods that return `Any` type, but generic type in `register` and `resolve` together with key based on it make sure that instance that is returned by factory has the same type (or is its derivative) as type `T` so downcast from `Any` to `T` is absolutely safe. And that's all the "magic". Now it can be improved to allow other features.

### Runtime arguments

For example what if we need to provide some runtime arguments to our factories when we resolve types? A bit more of generics and it's possible. First we need to distinguish factories that accept different runtime arguments. For that we add type of factory to the lookup key:

```swift
struct DefinitionKey : Hashable, Equatable {
    var protocolType: Any.Type
    var factoryType: Any.Type
    var associatedTag: DependencyContainer.Tag?
    
    var hashValue: Int {
        return "\(protocolType)-\(factoryType)-\(associatedTag)".hashValue
    }
}

func ==(lhs: DefinitionKey, rhs: DefinitionKey) -> Bool {
    return lhs.protocolType == rhs.protocolType && lhs.factoryType == rhs.factoryType && lhs.associatedTag == rhs.associatedTag
}
```

To have more flexibility container will store not just factories, but _definitions_, generic class that for now will only hold reference to factory which now will be of type `Any` - we don't care _here_ what it is (and we just don't know), we only need to store it.

```swift
protocol Definition {}

final class DefinitionOf<T>: Definition {
    let factory: Any
    let scope: ComponentScope

    init(factory: Any, scope: ComponentScope) {
        self.factory = factory
        self.scope = scope
    }
}
```

In `register` method to get access to type of passed in factory we will use generic again:

```swift
func register<T>(tag tag: Tag? = nil, scope: ComponentScope = .Prototype, factory: () -> T) -> DefinitionOf<T> {
    return register(tag: tag, factory: factory, scope: .Prototype)
}

func registerFactory<T, F>(tag tag: Tag? = nil, scope: ComponentScope, factory: F, scope: ComponentScope) -> DefinitionOf<T> {
    let key = DefinitionKey(protocolType: T.self, factoryType: F.self, associatedTag: tag)
    let definition = DefinitionOf<T, F>(factory: factory, scope: scope)
    dependencies[key] = definition
    return definition
}
```

We added another `register` method that does not care about actual type of factory, it can be anything (in practice it will be different kinds of closures), it only needs to use this type to create a key. Now we can use this second `register` method in method that registers factory with one runtime argument:

```swift
func register<T, Arg1>(tag tag: Tag? = nil, scope: ComponentScope = .Prototype, factory: (Arg1) -> T) -> DefinitionOf<T> {
    return register(tag: tag, factory: factory, scope: scope)
}
```

Here we use generic again, this time for type of runtime argument. In this method type `F` will be `Arg1 -> T`. Let's remember that.

That was one part of the problem, we can now register factory with one runtime argument or with no arguments, but how we resolve it? And if we have two different factories whit argument and with no argument registered for the same type how we choose between them? Here generics help us again.

```swift
func resolve<T>(tag tag: Tag? = nil) -> T {
    return _resolve(tag: tag) { (factory: () -> T) in factory() }
}

func _resolve<T, F>(tag tag: Tag? = nil, builder: F -> T) -> T {
    let key = DefinitionKey(protocolType: T.self, factoryType: F.self, associatedTag: tag)
    guard let definition = self.dependencies[key] as? DefinitionOf<T> else {
        fatalError()
    }
    return builder(definition.factory as! F)
}
```

The same way we introduced `register` method with generic type `F` for factory we add `resolve` method with type `F` that stands for the same type. But instead of passing actual factory to this method we pass it a _builder_ closure that accepts factory and returns instance that it creates, which is of type `T`. To build a key we use factory type `F`, get stored definition and pass factory that it holds to builder closure. Generic type `F` and key based on it make sure that type of factory stored in definition is actually `F`, so downcast is safe. The keys is also based on type of `T`, so we a sure that `F` is a closure that returns `T`. But where we get builder from? We make it ourselves in the outer `resolve` method - in this case it's a closure that accepts factory and returns it's value. The same way we can add `resolve` method that accepts runtime argument and pass it to factory:

```swift
func resolve<T, Arg1>(tag tag: Tag? = nil, withArguments: Arg1) -> T {
    return resolve(tag: tag) { (factory: (Arg1) -> T) in factory(arg1) }
}
```

Here we know that factory that we want to use should accept one argument, so we set it's type to `Arg1 -> T`. Builder type will be `Arg1 -> T -> T` and `F` will be `Arg1 -> T`. That's exactly the same type that we used in `register`, of course if `Arg1` used here and `Arg1` used there are the same. So the key built with this type `F` will give us factory that accepts argument of type `Arg1`.

Now we can add methods for as many arguments as we want. Use of generic type `F` for factory type lets us capture factory signature that contains all of its arguments and return type. So for the same type we can register different factories that accepts different types of parameters. Which factory will be used depends on what parameters we pass to `resolve` and - what is also important - in what order.

### Conclusion

I wanted to describe how I implemented circular dependencies and auto-injection but this post becomes too long already so I will leave it for the next time. Even without these features Dip is rather useful, can cover a lot of cases and can help in tests and loose coupling. Yet it's very simple. Probably what I like most about it is that how `as` operator works. It will be very easy to build new functionality on top of what we have now, providing features for UI components and Storyboards like Typhoon does but preserving it's swiftness and simplicity. When that will be done I hope there will be no more need for Typhoon in Swift code.

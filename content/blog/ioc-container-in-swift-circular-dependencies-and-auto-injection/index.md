---
id: 5b6f5a3a9d28c70f0f015f6c
title: IoC container in Swift. Circular dependencies and auto-injection
date: 2015-11-11T18:24:56.000Z
description: ""
tags: ""
---

> Note (15.04.16): This post is updated to reflect some of the latest changes in Dip.

<!-- description -->

In my [previous post](http://ilya.puchka.me/ioc-container-in-swift/) I wrote about [Dip](https://github.com/AliSoftware/Dip), lightweight IoC written in Swift. Here I would like to describe how some other of it's features were implemented. They are not yet available in original repo, but you can check them out in my [fork](https://github.com/ilyapuchka/Dip/tree/feature/auto-injection).

### Circular dependencies

Let's say we have a server-client model where client has reference to server and server has backward weak reference to it's client. First problem is that we can not have two objects that have reference to each other to be created with constructors like this:

    class ClientImp: Client {
        var server: Server
        init(server: Server) { self.server = server }
    }
    class ServerImp: Server {
        var client: Client
        init(client: Client) { self.client = client }
    }
    container.register { ServerImp(client: container.resolve()) as Server }
    container.register { ClientImp(server: container.resolve()) as Client }

If we try this we will end up in infinite recursion - we will not be able to finish creating instance of server or client and will enter another `resolve` which will enter another `resolve` and so forth.

Another problem is that we need to reuse already resolved instances somehow, otherwise we will have infinite recursion again trying to create new instances every time. For that we can simply store resolved instances in a dictionary by the same keys used to get factories to create them. We can abstract that to private class that will also detect when this pool of instances should be drained.

    class ResolvedInstances {
        var resolvedInstances = [DefinitionKey: Any]()
        private var depth: Int = 0
    
        func resolve<T>(@noescape block: () -> T) -> T {
          depth = depth + 1
          
          defer {
            depth = depth - 1
            if depth == 0 {
                resolvedInstances.removeAll()
            }
          }
    
          let resolved = block()
          return resolved
        }    
    }

As you can see when depth of recursion will reach zero (when code returns from outermost `resolve` call) cache will be cleared. Until then we can get instances from cache and reuse them.

To handle recursion we need to separate creation of object and resolving its dependency for at least one of circular dependencies. Either of `Client` and `Server` can still use constructor injection, but another (or both) should use property injection. Here where `DefinitionOf` class comes back on stage.

    func resolveDependencies(block: (DependencyContainer, T) -> ()) -> DefinitionOf<T, F> {
        guard resolveDependenciesBlock == nil else {
          fatalError("You can not change resolveDependencies block after it was set.")
        }
        self.resolveDependenciesBlock = block
        return self
      }
    
    var scope: ComponentScope
    var factory: F

Here we add few properties to this class - `resolveDependenciesBlock` and `scope`. First is a block that will be called by container after factory of this definition is called and just before `resolve` returns. Scope will define how exactly instances resolved by that definition will be reused - not reused at all, stored as singleton or reused during one call to `resolve`. The last one is the one that should be used to register circular dependencies. As I mentioned before not reusing instances will cause infinite recursion again. `resolvedInstance` property will be used only to store singleton instances.

With all that we can finally resolve circular dependencies:

    func resolve<T, F>(tag tag: Tag? = nil, builder: F -> T) -> T {
        let key = DefinitionKey(protocolType: T.self, factoryType: F.self, associatedTag: tag)
        guard let definition = self.definitions[key] as? DefinitionOf<T, F> else {
            fatalError("No definition registered with \(key)")
        }
    
        let usingKey: DefinitionKey? = definition.scope == .ObjectGraph ? key : nil
        return _resolve(usingKey, definition: definition, builder: builder)
    }
    
    func _resolve<T, F>(key: DefinitionKey?, definition: DefinitionOf<T, F>, builder: F -> T) -> T {
        return resolvedInstances.resolve {
    
            if let previouslyResolved: T = resolvedInstances.previouslyResolved(key) {
                return previouslyResolved
            }
            else {
                let resolvedInstance = builder(definition.factory)
        
                if let previouslyResolved: T = resolvedInstances.previouslyResolved(key) {
                    return previouslyResolved
                }
        
                resolvedInstances.storeResolvedInstance(resolvedInstance, forKey: key)
                definition.resolveDependenciesBlock?(self, resolvedInstance)
                return resolvedInstance
        }
    }
    
    extension ResolvedInstances {
        func storeResolvedInstance<T>(instance: T, forKey key: DefinitionKey?) {
            self.resolvedInstances[key] = instance
        }
      
        func previouslyResolved<T>(key: DefinitionKey?) -> T? {
            return self.resolvedInstances[key] as? T
        }
    }

Here we first check if we need to reuse instances at all. If we need then we use the same definition key to check if there is anything cached. If it's there we return it, otherwise we call builder. After builder is called we first should cache result and then call `resolveDependenciesBlock` block of definition if there is any. Interesting trick here is that after builder returns we check for instance to reuse again. That's because builder will call factory, that may call another `resolve` that may produce the same instance that we were trying to resolve originally. So when we return from builder and there is already cached instance we just return it instead of instance that was created by call to builder. Otherwise our circular dependency will be broken - we will have to clients and server, referenced by client will reference to another instance of `Client`.

### Auto injection

We can have situation when we already have an instance of some type (for example created by Storyboard) and we want to fill it's dependencies. Currently we can do it like this:

    class ServiceImp: Service {
        var logger: Logger
        var collaboratingService: AnotherService
    }
    
    let service = ServiceImp()
    service.logger = container.resolve() as Logger
    service.collaboratingService = container.resolve() as AnotherService

Or if we get `Service` instance also from the container can we have all of it's dependencies resolved without adding `resolveDependencies`, so that instead of this:

    container.register { AnotherServiceImp() as AnotherService }
    container.register { ServiceImp() as Service }.resolveDependencies { container, service in
        service.logger = container.resolve() as Logger
        service.collaboratingService = container.resolve() as AnotherService
    }
    let service = container.resolve() as Service

we would do just this:

    container.register { AnotherServiceImp() as AnotherService }
    container.register { ServiceImp() as Service }
    
    let service = container.resolve() as Service

The last case has much more cleaner syntax. Can we do that?

The idea is simple - using reflection we can get `Mirror` of the object that will contain all its properties and their values. To be able to change those values we will wrap them in simple class wrappers. This way value will be not copied in the mirror, but will reference the same object. If we will change its wrapped value we will change it not only for mirror, but in real instance too.

    final class Injected<T> {
        var _value: T?
        init(value: T?) {
            self._value = value
        }
    
        var value: T? {
            get {
                 return _value as? T
            }
        }
    }

Here I define some private protocol just to be able to detect that property is wrapped. And provide very simple generic wrapper that conforms to this protocol. Now I can use it to define property for my dependency:

    class ClientImp: Client {
        var server: Injected<Server>
    }
    
    container.register { ClientImp() as Client }
    container.register { ServerImp() as Server }
    
    let client = container.resolve() as Client

Here I faced the first problem - I need some initial value for `server` property or I need a constructor, or this property should be defined os optional. Using constructor will mean calling `resolve` on container manually. Optional will not work either cause `nil` value can not be checked for type with `is` operator, it will always return `false`. So I will not be able to detect that property is wrapped.

The solution is to use instance of `Injected<T>` that wraps `nil` value as initial value of property:

    final class Injected<T>: _Injected {
        ...
        init() { }
    }
    
    class ClientImp: Client {
        var server = Injected<Server>()
    }

So good so far. In `resolve` method before it returns I can call another method that will perform reflection and resolve dependencies of the instance:

    class DependencyContainer {
        
        func _resolve<T, F>(key: DefinitionKey?, definition: DefinitionOf<T>, builder: F->T) -> T {
            ...
            definition.resolveDependenciesBlock?(resolvedInstance)
            autoInjectProperties(resolvedInstance)
            return resolvedInstance
        }
     
        func autoInjectProperties(instance: Any) {
            for child in Mirror(reflecting: instance).children {
                ...
            }
        }
    }

And here I faced few other problems. First was that I have definition that can resolve only unwrapped type and I can not construct wrapped type in runtime. And another one - how to deal with weak values for circular dependencies. If we use `Injected` wrapper for circular dependencies we will have retina cycle, cause it holds strong reference to wrapped value.

I could try to work around first problem registering another definition for wrapped type like this:

    container.register { ServerImp() as Server }
    container.register { Injected(ServerImp()) as Injected<Server> }

But that's just code duplication. And I don't want clients to care about wrapper, I want it to be used only to define properties.

Instead we can ask wrapper to resolve its value. Inside wrapper we know wrapped type at compile time, so we will be able to call `container.resolve()`. We just need to pass in a container.

To do that we can introduce protocol:

    
    protocol AutoInjectedPropertyBox: class {
        func resolve(container: DependencyContainer)
    }
    
    extension Injected: AutoInjectedPropertyBox {
        public func resolve(container: DependencyContainer) {
            let resolved = container.resolve(tag: tag) as T
            value = resolved
        }
    }
    

Now it's trivial to resolve it:

    func autoInjectProperties(instance: Any) {
        for child in Mirror(reflecting: instance).children {
            if let injectedPropertyBox = child.value as? AutoInjectedPropertyBox {
                injectedPropertyBox.resolve(self)
            }
        }
    }

For weak properties I use the same approach. I introduce another wrapper `InjectedWeak` that reference wrapped value with `weak` property:

    final class InjectedWeak<T> {
        var _value: AnyObject?
      
        init() {}
    
        var value: T? {
            get {
                return _value as? T
            }
        }
    }
    
    extension InjectedWeak: AutoInjectedPropertyBox {
        func resolve(container: DependencyContainer) {
            let resolved = container.resolve(tag: tag) as T
            if !(resolved is AnyObject) {
                fatalError("\(T.self) can not be casted to AnyObject. InjectedWeak wrapper should be used to wrap only classes.")
            }
            value = resolved
        }
    }
    

And that's it! Now the only thing that you need is to use types wrapped in `Injected` for you properties and Dip will resolve them for you! You can even make them private and for clients of you classes provided computed property that will unwrap private property. Yes, that sounds like an overhead, but I think it's appropriate for such feature.

I really hope that these two features will make Dip even more useful than it is now.

---
id: 5b6f5a3a9d28c70f0f015f6d
title: Dependency injection with Dip
date: 2015-12-24T19:20:38.000Z
description: ""
tags: Swift, Dependency Injection
---

In some of my [previous posts](http://ilya.puchka.me/view-controller-thinning-dependency-injection/) I wrote about using dependency injection with Typhoon framework and [described](http://ilya.puchka.me/ioc-container-in-swift/) [some](http://ilya.puchka.me/ioc-container-in-swift-circular-dependencies-and-auto-injection/) internals of analogous pure-Swift framework called [Dip](https://github.com/AliSoftware/Dip). Here I want to illustrate how Dip can be used in a real project using the same example that I used before. Also this post will contain a sneak peak of some upcoming extensions of Dip (probably they will be released as separate projects). You can check out source code [here](https://github.com/ilyapuchka/ViewControllerThinning/tree/dip). Note that it uses [my fork](https://github.com/ilyapuchka/Dip) of Dip and features described here are not yet released as part of project or any extension.

<!-- description -->

> Note (15.04.16): This post is updated to reflect some of the latest changes in Dip.

#### Dip assemblies

> Note: this feature is implemented only in my fork [here](https://github.com/ilyapuchka/Dip/tree/feature/assemblies).

Fundamental components of Typhoon are `TyphoonDefinition` and `TyphoonAssembly`. In Dip we have `DefinitionOf<T, F>`, `Assembly` and `AssemblyDefinitionOf<T, U>`. As you could guess assemblies in Dip serve the same goal as in Typhoon - to encapsulate components' factories registration in standalone classes instead of making all registrations in one place. Also they create some kind of hierarchy of assembly classes. In Swift they can not be the same as `TyphoonAssembly` in terms of that they can not resolve components by themselves. That is still done by container. Assemblies only hold definitions that should be registered in container when assembly is activated in that container. So they are effectively just an alternative syntax for registering components in container. The same you can do with standard Dip syntax.

So how Dip assemblies look like? Here is the same `UIComponents` assembly I had when I used Typhoon, now written with Dip:

```swift
class UIComponents: Assembly {
    
    let authViewController = AssemblyDefinitionOf(tag: "ViewController") { (_, _: Void) in ViewController() }
        .resolveDependencies { (c, vc) -> () in
            vc.animationsFactory = try c.resolve() as AnimationsFactory
    }
    
    let authFormBehaviour = AssemblyDefinitionOf() { (c, _: Void) in
        AuthFormBehaviourImp(apiClient: try c.resolve()) as AuthFormBehaviour
    }
    
    let animationFactory = AssemblyDefinitionOf() { (c, _: Void) in
        c as AnimationsFactory
    }

    let shakeAnimaton = AssemblyDefinitionOf() { (_, view: UIView) in
        ShakeAnimationImp(view: view) as ShakeAnimation
    }
    
    //Collaborating assemblies
    
    let networkComponents = NetworkComponents()

}
```

`AssemblyDefinitionOf<T, U>` is a generic type where generic parameter `T` is a type of component to register and U is type of arguments accepted by factory. It is initialized with optional tag and factory that accepts container and runtime arguments. This factory is stored by assembly definition to create component definition when assembly is activated in container. When that happens using `activate(inContainer: DependencyContainer)` method of assembly or when container is created with its `init(assemblies:configure:)` initializer, assembly will iterate over all of its stored properties of type `AssemblyDefinitionOf`, will create `DefinitionOf<T, U throws -> T>` from them and will register these definitions in container. So when assembly is activated in some container this container will have all of assembly's definitions registered. You can activate/deactivate assemblies in different containers, there is no relationship between assembly and container.

Notice that there is also a stored property in `UIComponents` assembly that holds a reference to instance of another assembly - `NetworkComponents`. In Typhoon it is called "collaborating assembly". When assembly is activated it will also iterate over such properties and activate those assemblies in the same container. Let's look how this `NetworkComponents` assembly looks like:

```swift
class NetworkComponents: Assembly {
    
    let apiClient = AssemblyDefinitionOf() { (_, _: Void) in
        APIClient(baseURL: NSURL(string: "http://localhost:2368")!) as GhostApiClient
    }
    
}
```

Say no to boxing pure-Swift types to make them visible to Objective-C runtime to use them with Typhoon!

Using assemblies with collaborating assemblies you can register all your definitions with just one line like this:

```swift
let container = DependencyContainer(assemblies: [UIComponents()])
```

Looks neat, don't you think? This will not only activate all definitions from `UIComponents` assemblies but also from any of its collaborating assemblies. So that in definitions of one assembly you can use container to resolve definitions provided by another assembly. In this particular example we resolve `apiClient` dependency of view controller's form behavior using definition that comes from another assembly - `NetworkComponents`.

So you can see that assemblies are really just an alternative syntax to register definitions. It is arguably better, definitely more wordy and complex comparing to standard syntax. For that reasons this feature will be not a part of Dip project, but will be probably released as a separate library. But it makes a nice parallel with Typhoon assemblies so if you ever used Typhoon you may like it.

#### Storyboards integration

> Note: this feature is released as a separate extension - [Dip-UI](https://github.com/AliSoftware/Dip-UI)

So we have defined all the dependencies used by our view controller using assemblies, but how we inject them? There are two ways. You can create view controller in code and inject its dependencies manually, for example using constructor injection. You should not pass Dip container in constructor though, cause it will make dependencies of view controller implicit and that is bad. At least use a protocol that abstracts out the fact that passed instance is as `DependencyContainer`. The other way is to register definition for view controller type in Dip and resolve it using container. But if you use storyboard it will create instance of view controller for you. Then you need to use property injection and here is when storyboards integration and auto-injections come in to play.

There are few things you need to do to use storyboards integration:

1. you need to set a container to be used by storyboards
2. in Interface Builder you need to set a `dipTag` property on the instance where you want to inject dependencies in
3. you need to make your view controller conform to `StoryboardInstantiatable` protocol

To set a container to be used by storyboards there is a static property `container` added to `UIStoryboard` class. You can set it to your main container or any other container in app delegate. This container should have definitions for types where you want to inject dependencies in. In my case it is `ViewController` type. So I will just register view controller as usual using its `init()` initializer - at runtime this factory will be not called anyway because storyboard will already create the instance and container will just pick it up. You can still add `resolveDependencies` block to define how to resolve dependencies of that type. This block will be called when storyboard creates an instance. You can see the example of such definition in `UIComponents` assembly:

```swift
let authViewController = AssemblyDefinitionOf(tag: "ViewController") { (_, _: Void) in ViewController() }
    .resolveDependencies { (c, vc) -> () in
        vc.animationsFactory = try c.resolve() as AnimationsFactory
}
```

> Note: you don't need to use assemblies to use storyboard integration.

When you set `dipTag` on the instance in Interface Builder its setter will be called in runtime right after the moment the instance was created. And that is the point when Dip can resolve dependencies of that instance. This tag value will be used to lookup appropriate definition in container. Lookup will fallback to definition for the instance type registered for `nil` tag, so you don't even need to bother about tag value that you use in Interface Builder when you register definitions in container, you can register them without tags. But you can use different tags to have different definitions for the same type. For example if you use several instances of the same view controller but they require different dependencies you can have two definitions for that view controller type with different `resolveDependencies` block and different tags.

If Dip was able to find definition for the instance type then it will call its `resolveDependencies` block. After that it will auto-inject dependencies in this instance. It is the same logic used by `resolve` method of container.

So you can see that there are two ways you can resolve dependencies for instances created by storyboards. First is using `resolveDependencies` block. The second is using auto-injection feature. I already described in [previous post](http://ilya.puchka.me/ioc-container-in-swift-circular-dependencies-and-auto-injection/) how this feature works. All you need to do is to wrap your property type with `Injected` or `InjectedWeak` wrapper (or your own box type) and register definitions for that type.

The example project uses both of these ways. The manual way, using `resolveDependencies` block, is used to inject `animationsFactory` property of `ViewController`:

```swift
class UIComponents: Assembly {

    let authViewController = AssemblyDefinitionOf(tag: "ViewController") { (_, _: Void) in ViewController() }
        .resolveDependencies { (c, vc) -> () in
            vc.animationsFactory = try c.resolve() as AnimationsFactory
    }

    let animationFactory = AssemblyDefinitionOf() { (c, _: Void) in
        c as AnimationsFactory
    }

}

extension DependencyContainer: AnimationsFactory {
    func shakeAnimation(view: UIView) -> ShakeAnimation {
        return try! self.resolve(withArguments: view) as ShakeAnimation
    }
}

protocol AnimationsFactory {
    func shakeAnimation(view: UIView) -> ShakeAnimation
}
```

Note that the container itself is registered as instance of `AnimationsFactory` property cause it implements this protocol. The same way you can use a separate class to implement factory protocol but this way is also appropriate (though you can argue that then container violates single responsibility principle).

Auto-injection way is used to inject `formBehaviour` property of `ViewController`. Here is how it is defined:

```swift
class ViewController: UIViewController {

    private let _formBehaviour = Injected<AuthFormBehaviour>()
    
    var formBehaviour: AuthFormBehaviour? {
        return _formBehaviour.value
    }

}

class UIComponents: Assembly {

    let authFormBehaviour = AssemblyDefinitionOf() { (c, _: Void) in
        AuthFormBehaviourImp(apiClient: try c.resolve()) as AuthFormBehaviour
    }

}
```

Now I will have all the dependencies of `ViewController` injected at runtime and I've never called `resolve` or any other method on container myself. I don't even have a reference to container anywhere except app delegate and assemblies!

The only thing left to do is to wire up all the components in view controller. It does not depend on using Dip or any other form of DI - we already have all the dependencies, we just need to connect them among each other.

> Note: Basically it may/should be also done during resolving objects graph, but here we need to deal with root view, that can be not loaded yet. Here it would not be an issue.

It is very straightforward and can be done in `viewDidLoad` method:

```swift
override func viewDidLoad() {
    super.viewDidLoad()
        
    formBehaviour?.onLoggedIn = {[unowned self] in self.handleLogin($0, performedRequest: $1)}
        
    formBehaviour?.userNameInput = authView.userNameInput
    formBehaviour?.userNameInput.delegate = formBehaviour
        
    formBehaviour?.passwordInput = authView.passwordInput
    formBehaviour?.passwordInput.delegate = formBehaviour
        
    authView.loginButton.addTarget(formBehaviour, action: "submitForm", forControlEvents: .TouchUpInside)
        authView.cancelButton.addTarget(formBehaviour, action: "cancelForm", forControlEvents: .TouchUpInside)

    authView.userNameInput.shakeAnimation = animationsFactory?.shakeAnimation(authView.userNameInput)
    authView.passwordInput.shakeAnimation = animationsFactory?.shakeAnimation(authView.passwordInput)
}
```

The last thing to mention is that how easy you can create container and make it usable by storyboards. The only thing you need is to define it as a stored property of your app delegate like this:

```swift
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    let container = DependencyContainer(assemblies: [UIComponents()]) { c in
        DependencyContainer.uiContainer = c
    }
}
```

That's basically it. You can see that with auto-injection feature and storyboards integration it's very easy to resolve dependencies no matter where the instance comes from - storyboard or code. And assemblies let you break your definitions in groups of related components.

Of course any convenience comes at a price - you can say that setting container as a static property of `UIStoryboard` class will make it a service locator, or that assemblies syntax is not that good (you need to specify arguments type and can not reference assembly itself inside factory or `resolveDependencies` block). And probably you will be right. But that's a thing about such frameworks. They make some task more convenient or automated by adding some cost either in architecture or performance. So it is always a tradeoff between convenience and that additional costs.

In overall I'm very excited about Dip and its upcoming features. You can check out its roadmap [here](https://github.com/AliSoftware/Dip/wiki/Roadmap#the-roadmap)). I can't wait to use it not only in my side project but also in my main work project too.

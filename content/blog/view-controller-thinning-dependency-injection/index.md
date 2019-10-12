---
id: 5b6f5a3a9d28c70f0f015f6a
title: View controller thinning. Dependency injection with Typhoon.
date: 2015-10-27T11:56:27.000Z
description: ""
tags: ""
---

In my [previous post](http://ilya.puchka.me/view-controller-thinning-behaviours-and-interface-builder/) I described how you can break business and presentation logic in small PONSO's to achieve better separation of concerns and think view controller. To wire up dependencies, particularly those PONSO instances with view elements and actions I heavily used Interface Builder. In this post I will show how you can do the same using IoC-container instead of Interface Builder. As example of such IoC container implementation I will use [Typhoon](http://www.typhoonframework.org) framework. To checkout the full code you can use [this repo](https://github.com/ilyapuchka/ViewControllerThinning/tree/typhoon).

<!-- description -->

First lets start with defining what _IoC-container_ ("Inversion-Of-Control-Container") is. I will not dive deep in theory of Inversion Of Control principle, you better read about that [somewhere else](http://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod). IoC-container serves to simplify and automate the process of defining and resolving dependencies between software system components. Basically what IoC-container does is that it provides some API to register components and to resolve them later. Sometimes it can even resolve them for you so you don't even need to call any method to create an instance of your component. Imagine that you have component that depends on lot's of other components:

```swift
let apiClient = ApiClient(hostProvider: ApiHostProvider(), requestFactory: ApiRequestFactory(), requestSerializer: ApiRequestSerializer(), responseSerializer: ApiResponseSerializer(), cookiesStorage: CookiesStorage(), logger: ApiLogger())
```

With IoC-container you can use something like this:

```swift
let apiClient: ApiClient = networkComponents.resolve()
```

You can easily use _Dependency Injection_ pattern without any containers in relatively small systems but when number of components in your system grows so the number of dependencies grows and at some point you will end up with a lot of code that just wires things together. This setup logic can be scattered over you code. Instead you should aim to concentrate setup in one point. Basically it would be the earliest entry point of you program. Speaking of iOS app you can think of your app delegate. This is not perfect solution though. In large system you will have app delegate bloated with setup of different components. Also sometimes it's not possible or not efficient to define all dependencies at startup. You may need to decide what components to use at runtime depending on the state of your system or user input. This is when IoC-container will be very handy.

So let's look at Typhoon, so far the best IoC-container for Cocoa.

#### Typhoon

The way you use it is that you define _assemblies_ that provide _definitions_ for your system components. Definitions define the type of component they describe and how it will be created at runtime - what initializer will be used, what properties will be injected during resolution process and what methods will be called. You can think of assemblies as classes that provide factory methods for your components. But instead of manually creating components that factory methods return definitions for this components that Typhoon use later to create real components. What makes Typhoon even better is that you can seamlessly integrate it step by step in your application. You don't have to make you system Typhoon-centric and strongly depend on it. Also it works great with storyboards so it's very easy to start inject things. In runtime Typhoon will detect types of view controllers and inject their dependencies if you provide appropriate definitions.

Let's go back to our project and see how Typhoon can be used in practice. My view controller with login form have few dependencies, currently injected with Interface Builder. So I need to provide definition to instruct Typhoon what it should inject in this controller. To do that I define subclass of `TyphoonAssembly` and provide definition for `ViewController` class:

```swift
class UIComponents: TyphoonAssembly {
    dynamic func authViewController() -> AnyObject {
        return TyphoonDefinition.withClass(ViewController.self) { def in
            def.injectProperty("nibName", with: "AuthView")
        }
    }
}
```

Here I create method that returns `TyphoonDefinition` for `ViewController` class. From now on every time Typhoon stumble on `ViewController` in storyboard it will use this definition to setup this controller. Here setup is very simple, I just say that Typhoon should inject property `nibName` and set its value to `AuthView`. This way view controller will be loaded with root view from xib with this name. No I don't need to override this property in view controller.

Next I will add definition for form behavior:

```swift
dynamic func authViewController() -> AnyObject {
    return TyphoonDefinition.withClass(ViewController.self) { def in
        ...
        def.injectProperty("formBehaviour")
    }
}

dynamic func authFormBehaviour() -> AnyObject {
    return TyphoonDefinition.withClass(AuthFormBehaviour.self) {def in
        def.useInitializer("initWithAPIClient:") { method in
            ...
        }
    }
}
```

Here I say that to create form behavior instance I want Typhoon to use its `initWithAPIClient:` initializer. I will get back to that definition in a minute to explain details.

Next I can define animations:

```swift
dynamic func shakeAnimaton(view: UIView) -> AnyObject {
    return TyphoonDefinition.withClass(ShakeAnimationImp.self) { def in
        def.injectProperty("view", with: view)
    }
}
```

Here I use another feature of Typhoon - runtime arguments. When animation object will be created its `view` property will be set to the view passed to this definition as argument.

But wait, view controller does not have references to animation objects, instead input fields, subviews of its root view store them. So how I can set them? I don't have access to view controller or its view in definition, there is simply no object created yet when we define definition. The way it can be solved is that Typhoon can call arbitrary methods (injection callbacks) on created object before returning it. The drawback of this method is that I will have to access view property in this method what will load view earlier. Usually it's not a problem cause in most cases view is loaded shortly after view controller is created. But if it does not work well than you can inject assembly itself to view controller and access its definition to resolve animations in `viewDidLoad`.

```swift
dynamic func authViewController() -> AnyObject {
    return TyphoonDefinition.withClass(ViewController.self) { def in
        ...
        def.performAfterInjections("typhoonDidInject:") { method in
            method.injectParameterWith(self)
        }
    }
}

extension ViewController {

    func typhoonDidInject(uiComponents: UIComponents) {
        authView.userNameInput.shakeAnimation = uiComponents.shakeAnimaton(authView.userNameInput) as! ShakeAnimationImp
        authView.passwordInput.shakeAnimation = uiComponents.shakeAnimaton(authView.passwordInput) as! ShakeAnimationImp
    }
}
```

Here I define that as a last step of resolve process Typhoon should call `typhoonDidInject:` method of view controller with assembly as it's argument. Using this assembly I can access `shakeAnimtion` definition and resolve it.

In the same method I can finish wiring by connecting form behavior input fields to auth view subviews and adding actions to buttons:

```swift
func typhoonDidInject(uiComponents: UIComponents) {
    formBehaviour?.userNameInput = authView.userNameInput
    formBehaviour?.passwordInput = authView.passwordInput
    authView.loginButton.addTarget(formBehaviour, action: "submitForm", forControlEvents: .TouchUpInside)
    authView.cancelButton.addTarget(formBehaviour, action: "cancelForm", forControlEvents: .TouchUpInside)
    
    ...
}
```

Now it's time to go back to definition of network components.  
First of all I want to separate UI components assembly from network components assembly. But then to inject api client to form behavior I will need to somehow reference to network components assembly in UI components assembly so that I can do something like this:

```swift
def.useInitializer("initWithAPIClient:") { method in
    method.injectParameterWith(self.networkComponents.apiClient())
}
```

For that there is a mechanism in Typhoon called collaborating assemblies. To use it I can define a property of another assembly on UI components assembly.

```swift
private(set) var networkComponents: NetworkComponents!
```

When Typhoon will initialize UI components assembly it will inspect its properties and search for those that are subclasses of `TyphoonAssembly`. When it finds one it will search for assembly that it can inject in this property. So now I need to define assembly for network components:

```swift
class NetworkComponents: TyphoonAssembly {
    
    dynamic func apiClient() -> AnyObject {
        return TyphoonDefinition.withClass(APIClientBox.self) { (def: TyphoonDefinition!) in
            def.useInitializer("init:") { (initializer: TyphoonMethod!) in
                initializer.injectParameterWith(NetworkComponents.apiClientInstance)
            }
        }
    }
    
    private static let apiClientInstance: APIClient = {
        let host = "http://localhost:2368"
        let client = APIClient(baseURL: NSURL(string: host)!)
        return client
    }()
    
}
```

Now my two assemblies will be connected and UI components assembly will be able to use definitions from network components assembly in it's own definitions.

The other interesting thing here is that Typhoon can not inject Swift-native classes. So I wrap `APIClient` in simple PONSO wrapper and inject it instead.

```swift
public class APIClientBox: NSObject {
    let unboxed: APIClient
    dynamic init(_ boxed: AnyObject) {
        unboxed = boxed as! APIClient
    }
}
```

The last thing left to do is to tell Typhoon what assemblies it should activate at startup. There are different ways to provide initial assemblies - manual, using plist and using app delegate.  
To do it with app delegate I just need to implement `initialAssemblies()` method and return classes of assemblies that should be activated. Then Typhoon will activate them at the earliest point. After activation assembly will no longer return definitions from its methods, instead it will return resolved instances.

```swift
extension AppDelegate {
    func initialAssemblies() -> [AnyClass] {
        return [NetworkComponents.self, UIComponents.self]
    }
}
```

#### Conclusion

Typhoon is very powerful framework for DI. You can build very complex systems with complex graphs of dependencies and they all will be described using uniform and easy to read API. But Typhoon was originally designed for Objective-C and uses it's runtime features heavily. Thanks to languages interoperability it still works in Swift with some [restrictions and requirements](https://github.com/appsquickly/Typhoon/wiki/Swift-Quick-Start). In some cases I think it's even better to use Objective-C to define assemblies. For native Swift code it's rather easy to create basic IoC but supporting all of the features available in Objective-C looks impossible.  
Comparing with Interface Builder Typhoon requires more code of course, but it provides well defined point of setup, separated from the rest of the system, it provides uniform API to describe dependencies and it's just easier to follow code than expecting connections in Interface Builder. But no matter what approach you prefer I hope by this moment you share the with me understanding of actually very simple fact that proper dependency management, SRP and other principles are very important.

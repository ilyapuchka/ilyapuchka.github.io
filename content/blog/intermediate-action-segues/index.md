---
id: 5b6f5a3a9d28c70f0f015f6f
title: Intermediate action segues
date: 2015-12-27T19:54:38.000Z
description: "Storyboards segues are very cool. They are very easy yet powerful. They help to incapsulate presentation logic and move it out from view controllers. And adaptive segues are state of the art. There is only one thing (almost) left if view controller..."
tags: ""
---

> TL;DR - You can play with source code and example project [here](https://github.com/ilyapuchka/IntermediateActionSegue).

Storyboards segues are very cool. They are very easy yet powerful. They help to incapsulate presentation logic and move it out from view controllers. And adaptive segues are state of the art. There is only one thing (almost) left if view controller - managing segue performance using those two commonly used methods:

- `func shouldPerformSegueWithIdentifier(identifier: String, sender: AnyObject?) -> Bool`
- `func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?)`

And those methods are the place where we usually screw up everything with our custom logic based on tons of `if` or `switch` statements. Then we introduce different routers, coordinators and God knows what else (though they are all nice and interesting concepts), forgetting that we can just subclass a segue and do it not only to pass data around.

There is very common use case. You want to present some view only if user has been authorized in your application. If not then you what to show login form. Or register form with subsequent Terms of Use that user has to agree to in order to use your service. It is already a whole storyboard to be displayed in between.

You can do that with several `if`s if you have it in one place. But what if you have few places in your app where you need to authorize user before doing something?

Lets see how we can do that with custom segue. I will call this segue an `IntermediateActionSegue`.

Here are our design goals:

- segue should know nothing about current application context and application (view controllers) should know as little as possible about their presentation context (for instance that they were presented as intermediate controllers)
- segue should support different kinds of presentation style like modal, fullscreen, popover and custom
- segue should be adaptive
- there should be a way to present single view controller or a storyboard as intermediate action
- segue API should look like UIKit API, meaning that client code should be able to change presentation using delegate callbacks

Actually implementation of such segue is straight forward. All we need to do is to ask some delegate, custom object (that can be your lovely router, coordinator or what ever else) or simply segue's `sourceViewController`, to provide us with intermediate view controller, that we need to present instead of `destinationViewController`, and with its presentation style. For that we will use a protocol:

```swift
public protocol IntermediateActionPresentationDelegate: class {
    
    func intermediateViewControllerForSegue(segue: UIStoryboardSegue) -> UIViewController?
    
    func intermediateViewControllerPresentationStyleForSegue(segue: UIStoryboardSegue) -> IntermediateActionSeguePresentationStyle
    
    func willPresentIntermediateViewController(segue: UIStoryboardSegue, intermediateViewController: UIViewController)

    func intermediateViewControllerCompleted(intermediateViewController: UIViewController, success: Bool, completionData: AnyObject?) -> Bool

}
```

When that intermediate view controller completes its task we let the segue that presented it to know about that and depending on the result, success or failure, segue will complete itself dismissing intermediate view controllers and presenting `destinationViewController` or abort. For that we need to keep a reference to segue in a view controller. We can use associated object to add this property to any view controller in extension:

```swift
extension UIViewController {

    private struct AssociatedKeys {
        static var segueKey = 0
    }
    
    public private(set) final var intermediateActionSegue: IntermediateActionSegue? {
        get {
            return objc_getAssociatedObject(self, &AssociatedKeys.segueKey) as? IntermediateActionSegue ?? storyboard?.intermediateActionSegue
        }
        set {
            objc_setAssociatedObject(self, &AssociatedKeys.segueKey, newValue, objc_AssociationPolicy.OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }

}
```

Note that if we want to present intermediate storyboards we kind of loose control of the flow while we are on that storyboard. For instance we can not pass reference to segue that caused this storyboard to appear between view controllers of that storyboard. Technically we can but it will break our first design goal. So we additionally store reference to segue in storyboard when we present "initial" intermediate view controller again using associated object and extension.

The only difficulty is to handle different presentations that could happen along the way. But there are usually only two alternative variants - either intermediate controllers are presented modally or in navigation controller.

#### Conclusion

Of course that is neither an ideal nor the only one possible solution, there is still a room for improvements here. Using this kind of segue you will still sometimes need to switch on segues identifiers or something else to setup presentation logic or check conditions to display intermediate view controllers. But at least you will have few options here. You can use either extension of view controller or separate delegate object to define presentation and business rules. Or you can easily subclass this segue.

What I think is good is that now you can easily use any view controller or even storyboard as intermediate and they don't know almost nothing (except calling completion method on a segues) about how they are used. Your view controllers will communicate with intermediate controllers by well defined interface, separate from handling all other segues. When you move handling those segues in extension or separate object, that will make your view controller a bit cleaner.

You can play with source code and example project [here](https://github.com/ilyapuchka/IntermediateActionSegue).

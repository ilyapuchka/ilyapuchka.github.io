---
id: 5b6f5a3a9d28c70f0f015f5c
title: iOS storyboards segregation
date: 2014-12-08T00:07:57.000Z
description: ""
tags: ""
---

Recently here at Rambler&Co mobile team we decided to try technique of storyboards segregation (separation in other words). We came to the conclusion that this simple technique together with other techniques we use can help us to improve our's projects architecture, code readability and stability. Here is what we came up with.

<!-- description -->

Many techniques of applications development are based on [user stories](http://en.wikipedia.org/wiki/User_story) (or [use cases](http://en.wikipedia.org/wiki/Use_case)), in short - small logically connected pieces of functionality that application provides to user. Developers too also use the term of 'use cases' in application architecture design. So why not to use this concept to devide one massive storyboard in smaller pieces?

Usually if you are using storyboards in your project you may have at least one storyboard. If you have relatively simple project with few screens and transitions it is just fine - most likely you will also have very few user stories. But if you have some kind of large project with lots of different screens (e.g. [Afisha-Restaurants](/restaurants)) and possible segues among them then separating your single storyboard in several smaller storyboards can help you to maintain your code (by maintaining I mean i.e. merging storyboards) and to be clear about what transitions you have and where they point.

To go from one storyboard to another we need some special segue. What our cross-storyboard segue should do is to substitute it's destination view controller that it get's when segue is created by UIKit with some other view controller from another storyboard. First we must decide how our segue will know where to get it's destination view controller from. There are two ways. [One](http://spin.atomicobject.com/2014/03/06/multiple-ios-storyboards/) is to include this information in segue itself, right in it's identifier. [Another](https://github.com/rob-brown/RBStoryboardLink) is to include this information in destination view controller using some placeholder in place of view controller in source storyboard. First one is fairly simple and fully described in linked blog post. We will go the second way cause I like it more than tying up with segue identifiers. And we will use the power of Objective-C runtime.

To make our view controllers hold information about thier storyboards and thier storyboard identifiers we create a category of `UIViewController` that will add two properties - `storyboardName` and `storyboardIdentifier`. The first should match actual name of storyboard that contains view controller. The second should match view controller's storyboard ID from view controller's identity inspector (`UIViewController` does not provide such property from the box, so we have to duplicate it).

    @interface UIViewController (Storyboards)
    
    @property (nonatomic, copy) IBInspectable NSString *storyboardName;
    @property (nonatomic, copy) IBInspectable NSString *storyboardIdentifier;
    
    @end

The `IBInspectable` keyword will let us set this properties right in Interface Builder. In fact what this keyword does is just adding input fields for corresponding properties to attributes inspector. But you can (and always could) do the same using plane old runtime attributes in identity inspector. IBInspectable-marked properties will be automatically detected by Interface Builder no matter where they are declared.

Also we will add convenient method to create view controllers using this two properties:

    + (instancetype)viewControllerFromStoryboardWithName:(NSString *)storyboardName withStoryboardIdentifier:(NSString *)storyboardIdentifier;

Implementation looks like this:

    #import <objc/runtime.h>
    
    @implementation UIViewController (Storyboards)
    
    - (NSString *)storyboardName
    {
        return objc_getAssociatedObject(self, @selector(storyboardName));
    }
    
    - (void)setStoryboardName:(NSString *)storyboardName
    {
        objc_setAssociatedObject(self, @selector(storyboardName), storyboardName, OBJC_ASSOCIATION_COPY_NONATOMIC);
    }
    
    - (NSString *)storyboardIdentifier
    {
        return objc_getAssociatedObject(self, @selector(storyboardIdentifier));
    }
    
    - (void)setStoryboardIdentifier:(NSString *)storyboardIdentifier
    {
        objc_setAssociatedObject(self, @selector(storyboardIdentifier), storyboardIdentifier, OBJC_ASSOCIATION_COPY_NONATOMIC);
    }
    
    + (instancetype)viewControllerFromStoryboardWithName:(NSString *)storyboardName withStoryboardIdentifier:(NSString *)storyboardIdentifier
    {
        if (storyboardName.length > 0 && storyboardIdentifier.length > 0) {
            UIStoryboard *storyboard = [UIStoryboard storyboardWithName:storyboardName bundle:nil];
            if (storyboard) {
                return [storyboard instantiateViewControllerWithIdentifier:storyboardIdentifier];
            }
        }
        return nil;
    }
    
    @end

Really no need for comments (if you need read [this NSHipster blog post](http://nshipster.com/associated-objects/) for associated objects reference).

Now let's implement our "magic" segue. We can do this by subclassing `UIStoryboardSegue` but then we will have to create subclasses for every kind of presentation we use. Instead we will use method swizzling (I will no go into details of swizzling, check out [this NSHipster blog post](http://nshipster.com/method-swizzling/) for reference). With this code even your custom segues will work with view controllers from other storyboards with no need to modify segue code.

    //interface
    @interface UIStoryboardSegue (Storyboards)
    
    @end
    
    //implementation
    #include "UIViewController+Storyboards.h"
    #import "NSObject+Swizzling.h"
    
    @implementation UIStoryboardSegue (Storyboards)
    
    + (void)load
    {
        static dispatch_once_t onceToken;
        dispatch_once(&onceToken, ^{
            //Using NSObject category that actually performs swizzling
            [self swizzleSelector:@selector(initWithIdentifier:source:destination:) withSelector:@selector(storyboards_initWithIdentifier:source:destination:)];
        });
    }
    
    - (instancetype)storyboards_initWithIdentifier:(NSString *)identifier source:(UIViewController *)source destination:(UIViewController *)destination
    {
        return [self storyboards_initWithIdentifier:identifier source:source destination:[self destinationWithDestination:destination]];
    }
    
    - (UIViewController *)destinationWithDestination:(UIViewController *)destination
    {
        UIViewController *newDestination = [UIViewController viewControllerFromStoryboardWithName:destination.storyboardName withStoryboardIdentifier:destination.storyboardIdentifier];
        return newDestination?:destination;
    }
    
    @end

That's all with code for now. Now let's see how to use this in the project.

- In your main storyboard select view controller(s) you want to separate to other storyboard. Create new storyboard and move selected controllers there.
- In original storyboard leave the first of selected view controllers which will correspond to initial view controller of newly created storyboard. Now remove it's view - you just does not need it here any more cause you now have it in other storyboard. Now we have a placeholder for real view controller that will be loaded from other storyboard.
- Set `storyboardName` and `storyboardIdentifier` for this placeholder.  
_Remember that storyboard name should be the name of storyboard to load view controller and storyboard identifier should match one of this storyboard view controllers' stroyboard IDs (I always recommend to use view controller's class name for storyboard ID)_.

And you are done. When segue will be performed view controller will be loaded from storyboard with provided name. It can be any view controller in the storyboard, not necessarily initial view controller.

Of course this technique has some disadvantages and side effects you should concider. For example `-(id)initWithCoder:` and `-(void)awakeFromNib` will be called twice for controllers that are used in two different storyboards. Wherein `-(void)viewDidLoad` is called once. You can get rid of this by setting base class to `UIViewController` for this controllers' placeholders. Anyway two controllers will be instantiated but at least this will not call your own code twice.  
You can also consider for yourself using runtime as disadvantage. Than you can use subclassing.

One more thing that should be mentioned is what if we have `UINavigationController` or `UITabBarController` (and likely `UISplitViewController` too)? For instance `UITabBarController`'s child view controllers are set in storyboards using relationships, not segues and we can not customize relationships. So if you want to devide your storyboard by tab bar items you have a problem. But it's easy to fix using what we have done already. Remember we added convenient method in our `UIViewController` category that can create view controllers using storyboard name and storyboard identifier? Let's use it. Also we will need some method swizzling again. If you prefer not to use method swizzling you can create subclass or user other techniques, like dependecy injection, but for me it's too much for this simple task.

Let's add `UITabBarController` category and swizzle it's `-(void)awakeFromNib` method (it will look absolutelly the same way for `UINavigationController` and actually as far as `UITabBarController` and `UINavigationController` does not override `UIViewController`'s implementation of `-awakeFromNib` we can swizzle this method just in `UIViewController`). When this method is called `viewControllers` property of the instance is already set and all view controllers in this array already has their custom `storyboardName` and `storyboardIdentifier` properties set.

    //interface
    @interface UITabBarController(Storyboards)
    
    @end
    
    //implementation
    #import "NSObject+Swizzling.h"
    
    @implementation UITabBarController(Storyboards)
    
    + (void)load
    {
        static dispatch_once_t onceToken;
        dispatch_once(&onceToken, ^{
            [self swizzleSelector:@selector(awakeFromNib) withSelector:@selector(storyboards_awakeFromNib)];
        });
    }
    
    - (void)storyboards_awakeFromNib
    {
        [self storyboards_awakeFromNib];
    
        NSMutableArray *viewControllers = [self.viewControllers mutableCopy];
        [self.viewControllers enumerateObjectsUsingBlock:^(UIViewController *vc, NSUInteger idx, BOOL *stop) {
            UIViewController *newVC = [UIViewController viewControllerFromStoryboardWithName:vc.storyboardName withStoryboardIdentifier:vc.storyboardIdentifier];
            if (newVC) {
                [viewControllers replaceObjectAtIndex:idx withObject:newVC];
            }
        }];
        [self setViewControllers:viewControllers];
    }
    
    @end

Here we replace view controllers from `viewControllers` property with view controllers loaded from other storyboards.  
Now if you have `UITabBarController` as your root view controller your initial storyboard can contain just this controller and placeholders for it's child view controllers.

As a result all we have to do to separate storyboards is to set storyboard names and storyboard identifiers for some of our view controllers. With little efforts we are now able to maintain and read our storyboards easily and structure our code using cleaner architecture.

Related links:

1. [Sample project](https://github.com/ilyapuchka/StoryboardsSegregation)
2. [Easier Multiple Storyboards in iOS with Custom Segues](http://spin.atomicobject.com/2014/03/06/multiple-ios-storyboards/)
3. [https://github.com/rob-brown/RBStoryboardLink](https://github.com/rob-brown/RBStoryboardLink)
4. [http://nshipster.com/associated-objects/](http://nshipster.com/associated-objects/)
5. [http://nshipster.com/method-swizzling/](http://nshipster.com/method-swizzling/)

**UPDATE**

For cases when you don't use segues but instantiate and present view controllers manually we can add category for UIStoryboard that swizzles it's `-(id)instantiateViewControllerWithIdentifier:`. As we can not make iOS to use subclasses of UIStoryboard subclassing will not help here. Sample project is updated.

**UPDATE**

Basing on feedback from my colleagues and [this article](http://blog.newrelic.com/2014/04/16/right-way-to-swizzle/) about the "right way" of method swizzling I reimplemented this part of code and updated sample porject. The reset of implementation has not changed.  
Final code will look like this:

    //UIViewController+Storyboards.h
    
    + (void)swizzleAwakeFromNib
    {
        SEL sel = @selector(awakeFromNib);
        Method method = class_getInstanceMethod([UIViewController class], sel);
        ObjCMsgSendReturnNil originalImp = (ObjCMsgSendReturnNil)method_getImplementation(method);
    
        //UITabBarController and UINavigationController does not override -awakeFromNib, so we can swizzle UIViewController base implementation and check instance class.
        IMP adjustedImp = imp_implementationWithBlock(^void(UINavigationController *instance) {
            originalImp(instance, sel);
            if ([instance isKindOfClass:[UINavigationController class]] ||
                [instance isKindOfClass:[UITabBarController class]]) {
                NSArray *newViewControllers = [instance viewControllersWithViewController:[instance viewControllers]];
                [instance setViewControllers:newViewControllers];
            }
        });
    
        method_setImplementation(method, adjustedImp);
    }

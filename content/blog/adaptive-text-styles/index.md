---
id: 5b6f5a3a9d28c70f0f015f7f
title: Adaptive text styles
date: 2017-01-19T21:00:00.000Z
description: ""
tags: Swift, iOS
---

Textual content is the essential part of any app and text handling in iOS has been improving through last years. Starting with iOS 7 we have dynamic types and text styles, then in iOS 8 we got self sizing cells that help a lot when you want to adopt dynamic type. With trait collections we also expanded the ways how we can adapt text to different environments. And Apple was constantly extending those APIs exposing new font styles, font wights and so on.

<!-- description -->

There is one "but" here. I don't have official statistics and will be glad to be wrong, but I think most of the apps in the AppStore do not care about adapting text, or they simply use system font hoping that it will play nice, or handle it in a custom way via in app setting.

There are few reason why that can happen (again, I will be glad to be wrong that this is even the case) that I can think of. One of them is that it requires a lot of boilerplate to write. You need to listen to specific notification, you need to reference your labels and other views with outlets and update them when this notification arrives. More than that you will most likely need to adjust your layout, at least to handle multi line labels better than just trimming tail. The same with updating text on trait collection changes. You need to implement `traitCollectionDidChange(_:)` in every view or view controller and update all labels again. That's really tons of boilerplate that no one wants to deal with.

Another reason can be that out of the box these features work well with system font only and either require more code to work with custom fonts or simply don't work at all (like text styles).

Speaking of updating to trait collection changes things are a bit better here as it's very easy to set it up in Interface Builder without writing a single line of code. Simply add a variant for the font property. It works perfectly with any custom font and it will be automatically updated on trait collection change.

But if you want to use custom font, respond to trait collection changes and adopt dynamic type you still will need to write lots (less than if there was no trait collections support in Interface Builder, but still a lot) of boilerplate.

And even though setting up fonts in a storyboard looks like a feasible solution in fact it does not scale. Imagine that your designer decides to change a font. Or to change the size of each subtitle label from 14pt to 13pt. Depending on how much text you display in your app it can be either very trivial task or a real nightmare.

There is also `UIAppearance` that is very easy to use to setup global application appearance, but it does not work well when it comes to defining arbitrary styles of custom views. You can vary appearance properties for different trait collections, but you will need to use subclasses to set up their appearance, or if you want to avoid subclassing you can vary it based on containing types, what will again force you to subclass (and a lot). Also not every property of every view can be set with appearance proxy and you can not even extend it in Swift. So looks like this is not an option either.

What do we want are two simple things:

- automatically update text fonts when trait collection or content size category changes without writing any boilerplate code
- easily maintain a set of text styles
- avoid subclassing standard UIKit components

Can we do something with that?

Let's start from the very beginning. Before you start to implement anything you get the designs from your UI/UX team. If you are lucky enough these designs will come along with a very handy thing - a style guide. If it's not the case, please reach out to your design team right now and ask if they can provide it. Most likely they can and already have it, you just never asked. If you are supper lucky this style guide will be consistent across all the designs and will contain a finite number of colors and text styles to use in the app. By text style here I mean combination of font name, size, [weight](https://developer.apple.com/reference/uikit/uifontdescriptor/1659524-font_weights?language=objc) and [traits](https://developer.apple.com/reference/uikit/uifontdescriptorsymbolictraits?language=objc). It can also contain other attributes, like line height and letter spacing, but let's concentrate on basic properties.

With this style guide at hand you can easily transform it to code that can look something like this:

```swift
func bodyTextStyle(_ traitCollection: UITraitCollection) -> UIFont? {
  if case .compact = traitCollection.horizontalSizeClass {
    return UIFont(name: "Comic Sans", size: 20)
  } else {
    return UIFont(name: "Comic Sans", size: 24)
  }
}
```

As you can see we already think about using different size for different size class. And that's what your designer should think about too.

> Note: it's a very good idea to define font styles in a format that is readable both for designer and developer and then using a code generator like [Sourcery](https://github.com/krzysztofzablocki/Sourcery) transform it into code. At least you can use [R.swift](https://github.com/mac-cain13/R.swift/blob/master/Documentation/Examples.md#custom-fonts) or [SwiftGen](https://github.com/AliSoftware/SwiftGen#uifont-and-nsfont) to generate code to access your font resources.

When you are done with specifying your font style functions you will notice the obvious thing - they all have a same signature. Seems like a good candidate for a typealias:

```swift
public typealias TextStyle = (UITraitCollection) -> UIFont?
```

Let's move on and think about views. What do we want is to be able to apply some font style to a view that displays text and to update it automatically. For update we might need a function like `func updateStyle()`. This function should be called when trait collection or content size category changes. But how do we do that?

Each `UIView` conforms to `UITraitEnvironment` protocol that defines a property `var traitCollection: UITraitCollection { get }` and a method `func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?)`. So it looks like we should call our `updateStyle` from `traitCollectionDidChange`. But to do that we will need to create a subclass and override this method. Or we will need to implement this method on a view controller and call `updateStyle` on each view manually. But this is what we started from and what we want to get rid of.

To avoid subclassing we can try to observer `traitCollection` via `KVO`, but we will realize pretty soon that it's not KVO compliant. Sigh.

There is a interesting solution that I came up with, inspired by [this post](http://khanlou.com/2016/02/many-controllers/). There author uses child view controllers to separate some tasks from a parent view controller which require to receive all UIKit callbacks instead of its parent. If he can solve that applying composition to view controllers can we solve our problem with composition of views? Sure!

Instead of responding to trait collection change in the view itself we can add an invisible subview that will respond to them. These changes are propagated by UIKit from view to all of its subviews no matter if they are actually rendered or not. So the only thing that we need to do is to create a subclass of `UIView`, override `traitCollectionDidChange` method and add the instance of this view as a subview in a view that we want to update.

```swift
class StyleProxyView: UIView {
    
  override public func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    superview?.updateStyle()
  }
    
}
```

Looks good (you will see why I called it `StyleProxyView` later) but we can do it a bit more type safe with generics:

```swift    
class StyleProxyView<S: UIView>: UIView {
    
  weak var instance: S? { return superview as? S }
    
  override public func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    instance?.updateStyle()
  }
    
}
```

This way we will be able to add `StyleProxyView<UILabel>` only to `UILabel`.  
But most likely we will not need to change the style of any view, as plain `UIView` does not render any text. We will need it for `UILabel`, `UIButton` and some other views. So instead of constraining `StyleProxyView` to any `UIView` let's constrain it with a protocol. Let's call it something... stylish:

```swift
protocol Stylish {
  func updateStyle()
}

class StyleProxyView<S: Stylish>: UIView {
    
  var instance: S? { return superview as? S }
    
  override public func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    instance?.updateStyle()
  }
    
}
```

To update style we need a way to set it up first. Looking back at `UIAppearance` we can use a similar interface:

```swift
label.style.font = bodyTextStyle
```

Instead of setting property on a label (which is just `UILabel`) we set this property through a proxy object. And then we can use it to update label itself:

```swift
extension UILabel: Stylish {
  func updateStyle() {
    font = style.font(traitCollection) ?? font
    invalidateIntrinsicContentSize()
  }
}
```

But what is this proxy? Is it `StyleProxyView` that we defined before? Not exactly. You see, the `StyleProxyView` is still a `UIView`, so if we make `style` a `StyleProxyView` we will be able to do things like `label.style.frame = ...` which does not make any sense. Instead it will be a plain `NSObject` (on why we need an `NSObject` later) object:

```swift
public class StyleProxy<S: Stylish>: NSObject {
  fileprivate override init() { }
}
```

We will still use a `StyleProxyView` to access `style` property:

```swift
class StyleProxyView<S: Stylish>: UIView {
  var style: StyleProxy<S> = StyleProxy()
  ...
}
```

And now the missing part:

```swift
extension Stylish where Self: UIView {
    
  private(set) var style: StyleProxy<Self> {
    get {
      if let proxy = subviews.first(where: { $0 is StyleProxyView<Self> }) as? StyleProxyView<Self> {
        return proxy.style
      }
        
      let proxy = StyleProxyView<Self>()
      addSubview(proxy)
      return proxy.style
    }
    set {
      guard let proxy = subviews.first(where: { $0 is StyleProxyView<Self> }) as? StyleProxyView<Self> else { return }
      proxy.style = newValue
      updateStyle()
    }
  }

}
```

First time when we access `style` property we are adding a `StyleProxyView` as a subview. On next calls we will reuse that instance. Then we return its `style` property. Setter does not even require any explanation.

Here we defined `style` property as `var style: StyleProxy<Self>`, so when we use it on `UIView` instance it will be `StyleProxy<UIView>` (we will need to extend `UIView` with `Stylish` implementation for that), but if we use it on `UILabel` instance it will be `StyleProxy<UILabel>`.

> Note: if you try to use `StyleProxy<Self>` in a `Stylish` protocol like this: `func updateStyle(style: StyleProxy<Self>)` it will not work because compiler will give you an error when you will try to implement it i.e. on `UILabel`: _"Protocol 'Stylish' requirement 'updateStyle(style:)' cannot be satisfied by a non-final class ('UILabel') because it uses 'Self' in a non-parameter, non-result type position"_. But in extension it will work. Though `StyleProxyView` will be not able to access it any more. Sigh. Sometimes I doubt that Swift is a right name for the language.

Now when we can access style with `label.style` we can move on and add actual style properties to it. Here our generic constraints will start to help us as we are going to extend `StyleProxy` type for different types of its generic parameter `S`:

```swift
private var _textStyleKey: Void?

public extension StyleProxy where S: UILabel {
    
  var font: TextStyle? {
    get {
      //swifty wrapper for objc_getAssociatedObject
      return associatedValue(forKey: &_textStyleKey)
    }
    set {
      //swifty wrapper for objc_setAssociatedObject
      retain(newValue, forKey: &_textStyleKey)
    }
  }
    
}
```

Here for any `StyleProxy` with `UILabel` constraint we are adding `textStyle` property storing it as associated object (that's why we used `NSObject` as a base class for it) as we can not have stored variables in extensions, but we still have access to Objective-C runtime and can leverage it.

Now we can finally use it in `updateStyle`:

```swift
extension UILabel: Stylish {
  func updateStyle() {
    font = style.font(traitCollection) ?? font
  }
}
```

That's it. Now when you will do `label.style.textStyle = boldTextStyle` it will add a style proxy view that will respond to trait collection changes by calling `updateStyle` method defined on `UILabel` where you will update its font. You write it once and use it everywhere.

This post can seem to be long but describe implementation takes less than [100 lines](https://gist.github.com/ilyapuchka/d363c7307233f33708e5eaf1a2b19ce2). And it's straight forward to implement the same for `UIButton` or any other view with text. Simply create `StyleProxy` extension for this type with properties that you want to set and use them in `updateStyle` method of this type. It's also trivial to add observing for `UIContentSizeCategoryDidChangeNotification`. You can even extend text style to use `NSAttributedString` attributes, though this will require some additional work for ensuring its predictable behavior with attributes set through i.e. `attributedText` property of `UILabel`.

The profit of this implementation is that now you don't need to care about updating labels in `traitCollectionDidChange` of their superview, they will update themselves using text style that you set on them. At the same time you still can use static fonts with `font` property. You will be able to easily adjust fonts of all your labels or adding new style simply doing that in one place instead of doing that in every storyboard or xib. And we've built a structured collection of text styles that can be used independently from style proxies.

What do you think? Does it look like a feasible solution or it does not worth it? How do you manage text styles in your app?

---
id: 5b6f5a3a9d28c70f0f015f6e
title: Properties of types conforming to protocols in Swift
date: 2015-12-25T12:21:20.000Z
description: ""
tags: ""
---

In Objective-C it's very natural to have a property of type that also conforms to one or few protocols. In Swift that becomes tedious cause you can not simply combine types and protocols.

<!-- description -->

You can use generics:

```swift
class MyClass<T: MyOtherType where T: MyProtocol> {
  var property: T
}
```

But you will notice soon that this approach has more drawbacks then advantages. First if you need to have another such property it will become a mess. Second is that you can not use this type in Interface Builder anymore, as well as you can not see it from Objective-C environment. Third is that interface always looks more complex if there are generics.

The other way could be to define a protocol that adds some traits of class that you want to extend. Let's say you want to have a `UIView` property that also conforms to `Animatable` protocol and you want to access it's animatable trait and view trait. But you don't need to access all of the `UIView` properties, let's say you need only frame for now. Then you can simply add this property to protocol that extends `Animatable` protocol, or use protocols composition:

```swift
protocol Animatable {
  func startAnimating()
  func stopAnimating()
}

protocol AnimatableView: Animatable {
  var frame: CGRect { get }
}

class ViewController: UIViewController {
  var view: AnimatableView
}
```

You probably already noticed some problems here too. Every time you will need to access new property of `UIView` you will need to add it to `AnimatableView` property. Also you can not pass `view` property as argument to methods that accept `UIView`. You can of course force cast it to `UIView` but [pony will be hurt](http://alisoftware.github.io/swift/2015/09/14/thinking-in-swift-1-addendum/) then.

There is much cleaner yet easy solution:

```swift
protocol Animatable {
  func startAnimating()
  func stopAnimating()
}

protocol AnyView {
  var view: UIView { get }
}

protocol AnimatableView: AnyView, Animatable {}
//or using protocols composition
typealias AnimatableView = protocol<AnyView, Animatable>

extension UIView: AnyView {
  var view: UIView { return self }
}
```

Instead of having protocol that exposes _some_ properties of `UIView` we expose the whole `UIView` type via property and access it when we need to work with instance as with `UIView`.

This approach has all advantages of previous one - you can easily access your property by its different traits. But it does not have any of drawbacks of previous solutions. You don't ever need to add any property from `UIView` class to your protocols if you want to access it. You can use the property in methods that accept `UIView` simply by passing in its `view` property. And of course you don't loose Objective-C interoperability and Interface Builder support.

There are different examples of such approach. For instance Alamofire uses `URLRequestConvertible` protocol:

```swift
public protocol URLRequestConvertible {
  var URLRequest: NSMutableURLRequest { get }
}
extension NSURLRequest: URLRequestConvertible {
  public var URLRequest: NSMutableURLRequest { get }
}
```

Personally I would not use `Convertible` name for such protocols cause it doest not mean the same as `Convertible` protocols in Swift standard library where usually they mean that you can create an instance of protocol type _from_ some other type. For instance you can create `StringLiteralConvertible` instance _from_ `String`. Or you can create instance of `ArrayLiteralConvertible` _from_ array literal. But you can not get array literal back from `ArrayLiteralConvertible`. So it is conversion only in one direction - _from external_ type _to self_ type. But here we need conversion in other direction - _from_ self type _to external_ type.

There are though `CustromStringConvertible` and `ConstomDebugStringConvertible` that look more like `URLRequestConvertible` from Alamofire. But for me they are kind of special and I think I liked original `Printable` name more.

Personally I would prefer to use names like `AnyView` or `AnyURLRequest` or even `ViewRepresentable` or `URLRequestRepresentable`. The former is shorter when the latter I think better describes the direction of conversion that happens.

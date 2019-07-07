---
id: 5b6f5a3a9d28c70f0f015f83
title: Swift enums with associated values defaults
date: 2017-03-24T10:01:21.000Z
description: ""
tags: ""
---

In Swift enums are much more powerful than we got used to in other languages. One of the features that makes them more interesting to use is associated values - values that each instance of enum case can carry along with it. We can not have stored properties in the enum, so associated values is basically the only way to store additional data with enum value. Creating an enum value with associated value has a similar semantics as a method call. The difference is - we can not define defaults for parameters which represent associated values.

<!-- description -->

Here is a real-life example. I was implementing a custom popover presentation for which I have a relative position, view to present popover from and an inset from it along with several other parameters. First I had all of these properties defined as a separate method parameters:

```swift
public class PopoverPresentationController {
    public init(presentedViewController: UIViewController,
                presenting presentingViewController: UIViewController?,
                position: PopoverPosition = .center,
                inset: CGFloat = 8,
                fromView: UIView? = nil,
                passThrough: Bool = false,
                dimBackground: Bool = false,
                onTouchOut: (() -> Void)? = nil) {
    ...
    }
}
```

First there were just few constructor parameters, but soon their number grow. It was time to refactor. Usual way to solve constructor over-injection is to refactor set of parameters into a new abstraction. It comes to mind pretty fast that `position`, `inset` and `fromView` all describe popover position. I already had a `Position` enum defined like this:

```swift
public enum Position {
    case bottom
    case top
    case center
}
```

so I decided to add the rest of the properties to its associated values:

```swift
public enum Position {
    case bottom(fromView: UIView?, inset: CGFloat)
    case top(fromView: UIView?, inset: CGFloat)
    case center(fromView: UIView?)
}
```

What I liked about that solution is that I could solve the issue that `inset` actually does not matter for `center` position, and with enum and associated values I can avoid meaningless parameters.

What I didn't like though was the fact that I loose the ability to use default values. So after this refactoring the code became cluttered with those defaults pretty fast:

showPopoverMessage(message, position: .bottom(fromView: nil, inset: 8))

So I started to wonder if there is a way to workaround Swift limitation of not being able to specify defaults for associated values. In the end I found few ways to do that.

#### Enum with static factory methods

The first solution that comes to mind is to define static factory methods with default parameters:

```swift
public enum PopoverPosition {
    case bottom(fromView: UIView?, inset: CGFloat)
    case top(fromView: UIView?, inset: CGFloat)
    case center(fromView: UIView?)

    public static func bottom(fromView: UIView? = nil, inset: CGFloat = 8) -> PopoverPosition {
        return PopoverPosition.bottom(fromView: fromView, inset: inset)
    }
} 
```

Unfortunately this will not compile - compiler treats static method as redeclaration of enum case (even if different argument labels are used). There are two options here: either to change methods names, i.e. using an external name of first parameter as a method name prefix:

```swift
public enum PopoverPosition {
    case bottom(fromView: UIView?, inset: CGFloat)
    ...
    public static func bottomFrom(_ fromView: UIView? = nil, inset: CGFloat = 8) -> PopoverPosition {
        return PopoverPosition.bottom(fromView: fromView, inset: inset)
    }
} 
```

or to rename enum cases, i.e. capitalising them:

```swift
public enum PopoverPosition {
    case Bottom(fromView: UIView?, inset: CGFloat)
    ...
    public static func bottom(fromView: UIView? = nil, inset: CGFloat = 8) -> PopoverPosition {
        return PopoverPosition.Bottom(fromView: fromView, inset: inset)
    }
} 
```

The main downside of this approach is the need to use different names for methods and cases.

#### Using struct instead of enum

Another pretty obvious option is to switch from enum to struct.

```swift
public struct PopoverPosition {
    
    public enum Position {
        case bottom
        case top
        case center
    }
    
    public let position: Position
    public let fromView: UIView?
    public let inset: CGFloat
    
    private init(position: Position, fromView: UIView?, inset: CGFloat) {
        self.position = position
        self.fromView = fromView
        self.inset = inset
    }
    
    public static func bottom(fromView: UIView? = nil, inset: CGFloat = 8) -> PopoverPosition {
        return PopoverPosition(position: .bottom, fromView: fromView, inset: inset)
    }
}
```

This is a bit more to type but it solves the issue. With private initialiser we can limit ways to construct the value to only factory methods which makes it closer to enum cases with associated values. The downside is that now we have two types instead of one (struct and enum) and we can not use `PopoverPosition` value in a `switch`, we have to use its `position` property.

#### Using enum with a builder

Trying to stick with enum I came up with another option - using an inner builder type to scope factory methods and avoid compiler complaining about redeclarations:

```swift
public enum Position {
    case bottom(fromView: UIView?, inset: CGFloat)
    case top(fromView: UIView?, inset: CGFloat)
    case center(fromView: UIView?)
    
    public enum Builder {
        public static func bottom(fromView: UIView? = nil, inset: CGFloat = 8) -> Position {
            return Position.bottom(fromView: fromView, inset: inset)
        }
        ...
    }
    
    public static var make: Position.Builder.Type {
        return Position.Builder.self
    }
}
```

With this now I have a way to construct enum value with default associated values like this:

```swift
let position = Position.Builder.bottom()
```

Instead of using `Builder` directly, which looks a bit clumsy we can use a `make` method defined in enum:

```swift
public enum Position {
    public static var make: Position.Builder.Type {
        return Position.Builder.self
    }
}

let position = Position.make.bottom()
```

#### Conclusion

After all I ended up using a struct instead of enum. Again I end up with preferring something else to enum, which I consider a code smell in general. There is definitely a place for enums in Swift code, and I do use them from time to time, but most of the time they are not the best option.

#### Update

Thanks to [Olivier](https://twitter.com/aligatr) for pointing me to the [proposal](https://github.com/apple/swift-evolution/blob/master/proposals/0155-normalize-enum-case-representation.md) that is supposed to fix the issue that caused this post in the first place by normalising associated values representations, which will result in allowing defaults for associated values.

---
id: 5b6f5a3a9d28c70f0f015f68
title: View themes
date: 2015-10-03T15:23:35.000Z
description: ""
tags: ""
---

In my [previous post](http://ilya.puchka.me/view-controller-thinning/) you could see that I've used `ColorTheme` and `ThemedView` protocol to easily customize view appearance. Though that solution works I was not satisfied with it from very beginning. Here I try to find another solution.

<!-- description -->

What I really didn't like about my that solution was a check of tag type (`if let tag = tag as? FormTextField.ThemeColorTag`). Usually I try to avoid any kind of type checking. But here I have nothing to do but to check the type of tag.

The problem is that I tried to define some base protocol for color them. That led to the fact that any theme can be applied to any view. What will make more sense is that if I can have different kinds of themes for different kinds of views so that let's say UITextField can not be styled with theme for UIButton. Also it would be nice to extend UIKit views with default behavior of applying theme.

I could try solve that by adding type alias to `ColorTheme` to define type of tags that it can accept. But that would led to adding generic constraints to any subclass of UIView that should use theme (which will mean that I can't use them with outlets) and will also prevent to apply themes to standard UIKit components.

In the app I have custom UITextField subclass. So I need to define theme for UITextField. I want to be able to use different kind's of themes and I want them to be value types (cause at the end it's just a data structure that contains color values). I need a protocol for that.

```swift
protocol TextFieldTheme {
    var textColor: UIColor {get}
    var placeholderColor: UIColor {get}
    var tintColor: UIColor {get}
    var leftViewTintColor: UIColor {get}
    var rightViewTintColor: UIColor {get}
    var backgroundColor: UIColor {get}
}
```

Here I define protocol that defines methods to access color values specific for UITextField. For UIButton and other views there will be another set of functions.

Now this protocol can be extended to provide default values for each of color. This way when I will define concrete theme I will not need to define properties for values that are not different from default.

```swift
extension TextFieldTheme {
    var textColor: UIColor {
        return UIColor.blackColor()
    }
    var placeholderColor: UIColor {
        return UIColor.lightTextColor()
    }
    var tintColor: UIColor {
        return UIColor(red: 0, green: 100.0/255.0, blue: 220.0/255.0, alpha: 1)
    }
    var leftViewTintColor: UIColor {
        return UIColor(red: 0, green: 122.0/255.0, blue: 1, alpha: 1)
    }
    var rightViewTintColor: UIColor {
        return UIColor(red: 0, green: 122.0/255.0, blue: 1, alpha: 1)
    }
    var backgroundColor: UIColor {
        return UIColor.whiteColor()
    }
}
```

Here I use colors that are close to system default values.

In a subclass of UITextField, `FormTextField` I have custom right accessory view. To define it's style I need to extend `TextFieldTheme` protocol and add additional property. Also I want `FormTextField` to change it's background color whet it is highlighted. For that I can define separate protocol that will define background color for highlighted state.

```swift
protocol HighlightedBackgroundTheme {
    var highlightedBackgroundColor: UIColor {get}
}

protocol FormTextFieldTheme: TextFieldTheme, HighlightedBackgroundTheme {
    var invalidIndicatorColor: UIColor {get}
}

extension FormTextFieldTheme {
    var highlightedBackgroundColor: UIColor {
        return backgroundColor
    }

    var invalidIndicatorColor: UIColor {
        return UIColor(red: 220.0/255.0, green: 0, blue: 0, alpha: 1)
    }
}
```

Now I have everything to create concrete theme.

```swift
struct FormTextFieldDefaultTheme: FormTextFieldTheme {}

struct FormTextFieldCustomTheme: FormTextFieldTheme {
    
    var textColor: UIColor {
        return UIColor.whiteColor()
    }
    var placeholderColor: UIColor {
        return UIColor.lightTextColor()
    }
    var tintColor: UIColor {
        return UIColor.whiteColor()
    }
    var leftViewTintColor: UIColor {
        return placeholderColor
    }
    var rightViewTintColor: UIColor {
        return placeholderColor
    }
    var backgroundColor: UIColor {
        return UIColor(red: 103.0/255.0, green: 103.0/255.0, blue: 103.0/255.0, alpha: 1)
    }
    
    var highlightedBackgroundColor: UIColor {
        return UIColor(red: 145.0/255.0, green: 145.0/255.0, blue: 145.0/255.0, alpha: 1)
    }
    
}
```

Here I define default theme that inherits all it's values from protocol extension. And custom theme that overrides default values.

Now how can I use those themes? First I can extend UITextField and add method that will apply theme on it.

```swift
extension UITextField {
    func updateAppearance(theme: TextFieldTheme) {
        tintColor = theme.tintColor
        textColor = theme.textColor
        backgroundColor = theme.backgroundColor
        leftView?.tintColor = theme.leftViewTintColor
        rightView?.tintColor = theme.rightViewTintColor
        attributedPlaceholder = attributedPlaceholder(theme)
    }
    
    func attributedPlaceholder(theme: TextFieldTheme) -> NSAttributedString? {
        if let placeholder = placeholder {
            return NSAttributedString(string: placeholder, attributes: [
                NSForegroundColorAttributeName: theme.placeholderColor
                ])
        }
        return nil
    }
}
```

Now I can apply `TextFieldTheme` to any kind of UITextField including `FormTextField`. I can reuse that and in `FormTextField` I can add method that will apply `FormTextFieldTheme`.

```swift
var theme: FormTextFieldTheme = FormTextFieldDefaultTheme() {
    didSet {
        updateAppearance()
    }
}

func updateAppearance() {
    updateAppearance(theme)
}

func updateAppearance(theme: FormTextFieldTheme) {
    super.updateAppearance(theme)
    backgroundColor = highlighted ?
        theme.highlightedBackgroundColor :
        theme.backgroundColor
    (rightView as? InvalidInputIndicator)?.backgroundColor = theme.invalidIndicatorColor
}
```

Here I also define stored property for theme and shorthand method that will apply current theme.

I should note that `FormTextField` has now two different methods: `updateAppearance(_: TextFieldTheme)` and `updateAppearance(_: FormTextFieldTheme)`. The latter does not override the former cause they have different types and also even if we try to override it Swift does not support overriding declarations from extensions. I could solve that by not adding `updateAppearance(_: FormTextFieldTheme)` but setting right accessory view background color and highlighted background color right in UITextField extension. But then I will need first to check if passed in theme actually conforms to `HighlightedBackgroundTheme` or `FormTextFieldTheme`. That's bad because we will need to change this extension every time we add any new theme and it will potentially lead to lots of `if` statements.

Having two different methods on the other hand makes sense if you think about it. Definition of `TextFieldTheme` provides clear information about what colors it can change. `FormTextFieldTheme` in its turn tells us that it can change all the properties that `TextFieldTheme` can change but also properties specific for `FormTextField`. So when you call `updateAppearance(_: TextFieldTheme)` it makes sense that it will change only those colors that are defined by `TextFieldTheme`. And when you call `updateAppearance(_: FormTextFieldTheme)` you know that it can change also colors specific for `FormTextField`.

More than that Swift don't even let us override `updateAppearance(_: TextFieldTheme)` with `updateAppearance(_: FormTextFieldTheme)`, instead it forces us to have two distinct methods. And that's great because overriding method defined in superclass with method that requires more specific input is violation of [Liskov substitution principle](http://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod). It breaks a contract defined by superclass cause subclass asks more from it's clients than superclass. It's easy to misunderstand what 'more' means when it comes to inheritance. You may think that asking for superclass as argument is 'more' than asking for concrete subclass cause more objects can be passed in where superclass is expected. But in fact it's absolutely another way round cause asking for superclass is asking for less specific instance, where asking for subclass is asking for _more_ specific instance. Here Swift behavior is different from Objective-C. Objective-C would easily let us break the contract cause types of parameters are not the part of method signature.

That's it. Now I have notion of themes without any type checking and with ability to apply theme not only to my custom views, but also to standard UIKit components. In real life application I will probably extend this solution with notion of Color Palette. The thing is that in real life when you work with designer it's very useful when you have defined finite set of colors (palette), marked by numbers (like color1, color2 etc) or some names, and when that colors are used consistently across whole application. This way designer does not need to specify exact colors on each view design but can just put references to color palette. At the same time developer can specify all colors in definition of palette and reference them in each theme. It will help you to remove duplication of hardcoded color values in your themes.

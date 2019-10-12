---
id: 5b6f5a3a9d28c70f0f015f67
title: View controller thinning
date: 2015-09-26T17:51:00.000Z
description: "\"Massive view controller\" is one of the most favorite topic for iOS developers when they talk about architecture. A lot have been said on this topic already, even more will be said in future cause unfortunately there is no silver bullet and view controller still stay massive in many projects. Recently Andy Matuschak presented here and there a live coding session on this topic. So you can see it's a well know and still actual problem."
tags: ""
---

"Massive view controller" is one of the most favorite topic for iOS developers when they talk about architecture. A lot have been said on this topic already, even more will be said in future cause unfortunately there is no silver bullet and view controller still stay massive in many projects. Recently Andy Matuschak presented [here](https://realm.io/news/andy-matuschak-refactor-mega-controller/) and [there](https://vimeo.com/140037432) a live coding session on this topic. So you can see it's a well know and still actual problem.

The real problem is that there are a lot of responsibility in UIViewController already defined in UIKit. So why to add even more? We should try to minimize view controller responsibility as much as any other class in our application. Apple have made view controller the hart of each iOS application so we should respect them and treat them with the same care as our model, network or persistence layer. But instead we centralize all our code in view controllers.

Recently I've started to work on my new home project and from the beginning I've tried few techniques that I wanted to try for a long time. I think they can be useful in any other project. Not as a step-by-step recipe to solve all possible problems, but as concepts that you can apply to solve your particular case.

A lot of code is involved in this topic so I decided to break it in few parts. In this post I will show how you can refactor messy view controller and make it thinner so that it will follow Single Responsibility principle more. In next post I will show how you can make a next step forward to SRP with concept of behaviors and how Interface Builder lets us decrease lines of code even more if we use it not just to create layouts but as a dependency injection tool. After that I will take the same problem of dependency injection and will show how to solve it with Typhoon framework. You can follow the history of changes [here on GitHub](https://github.com/ilyapuchka/ViewControllerThinning/commits/master).

We will build very simple single view application which will display authorization form and let user to login on arbitrary service. To make things more interesting it will involve some animations and custom UI. We won't need to make any real network requests but for demonstration I'll use [SwiftNetworking](https://github.com/ilyapuchka/SwiftNetworking) - framework that I described in [one of my previous posts](http://ilya.puchka.me/networking-in-swift/).

#### Specification

Application should display two input fields - for email and password - and two buttons - to login and to restoring password. If login fails the alert with error message should be displayed. If login or password are invalid then corresponding input fields should be marked with red dot at their right side and should be animated with "shake" animation. When user selects input field its background color should change to slightly lighter color with animation. When user deselects input filed its background color should animate back to initial color. Same effect should be applied to login button when user touches it or removes his finger from it. It should look something like this:  

![gif](/images/PyTEKxWkVk.gif)

#### Initial state

As initial state we will take massive view controller that manages everything - views, control actions, animations and business logic.  
The whole code is too long to paste it here, so here are links on GitHub - [ViewController.swift](https://github.com/ilyapuchka/ViewControllerThinning/commit/c59a559a8e9696e7a1b7db985541d15c4bd4755f#diff-c4235c55b20764be6f0579b4eff3f989), [FormTextField.swift](https://github.com/ilyapuchka/ViewControllerThinning/commit/c59a559a8e9696e7a1b7db985541d15c4bd4755f#diff-6bc6e79c934260fdd27548d3de88e9f5).

You can see that view controller does so much stuff that it is very hard to understand what it actually does. The only thing that it does not manages are some text input metrics. And this is only because of the API that `UITextField` provides.

#### Helpers

We will start with extracting some parts of code in small helpers. To setup icons of text fields we use hardcoded file names. With Swift 2 we can instead define simple extension of UIImage that will use enum with String raw value instead of String file name to create image.

```swift
extension UIImage {
    enum AssetIdentifier: String {
        case InputEmailIcon
        case InputPasswordIcon
    }
    convenience init!(_ assetIdentifier: AssetIdentifier) {
        self.init(named: assetIdentifier.rawValue)
    }
}
```

Swift 2 will automatically assign raw values to enum cases with String raw value type if they are not provided explicitly. So only thing that you should care about is that enum cases should match assets identifiers. If you want you can even generate such enum on build time using some script. This way you will never mistype image names in your code and you will have code completion.

Next we can make corner radius `IBInspectable` property so that we don't need to set it in code and don't need to access it through layer property.

```swift
extension UIView {
    @IBInspectable
    var cornerRadius: CGFloat {
        get {
            return layer.cornerRadius
        }
        set {
            clipsToBounds = newValue != 0
            layer.cornerRadius = newValue
        }
    }
}
```

Now any subclass of UIView will have field to set it's corner radius in Interface Builder.

Currently we setup text field's icon tint color manually in code and separately for each text field's. It would be cool if we can set it using UIAppearance. The problem is that for that we need to set tint color for UIImageView only if it is contained in UITextField using `+(instancetype)appearanceWhenContainedIn:(Class <UIAppearanceContainer>)ContainerClass, ...`. This API is available from Objective-C but is not available from Swift in iOS 8 (it's available for Swift only in iOS 9 with `+ (instancetype)appearanceWhenContainedInInstancesOfClasses:(NSArray<Class <UIAppearanceContainer>> *)containerTypes`). To solve that we can define Objective-C category that will accept only one class instead of variadic parameter.

```
@import UIKit;

@interface UIView (Appearance)

+ (instancetype)gh_appearanceWhenContainedIn:(Class<UIAppearanceContainer>)containerClass;

@end

@implementation UIView (Appearance)

+ (instancetype)gh_appearanceWhenContainedIn:(Class<UIAppearanceContainer>)containerClass {
    return [self appearanceWhenContainedIn:containerClass, nil];
}

@end
```

You can notice that in our application we have few animations with the same duration. It would be cool if we can add implicit animation duration for each view. That will make animations consistent through the whole application. Also you will see how easy it is to add custom UIAppearance properties.

```
@import UIKit;

@interface UIView (Appearance)
...
@property (nonatomic) NSTimeInterval implicitAnimationDuration UI_APPEARANCE_SELECTOR;

@end

@import ObjectiveC.runtime;

@implementation UIView (Appearance)
...
- (void)setImplicitAnimationDuration:(NSTimeInterval)implicitAnimationDuration
{
    objc_setAssociatedObject(self, @selector(implicitAnimationDuration), @(implicitAnimationDuration), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

- (NSTimeInterval)implicitAnimationDuration
{
    return [objc_getAssociatedObject(self, @selector(implicitAnimationDuration)) ?: @(0.25) doubleValue];
}

@end
```    

Here we use Objective-C runtime to define animation duration value using UIView category. To make it accessible through UIAppearance proxy object of UIView we only need to annotate it with `UI_APPEARANCE_SELECTOR` <sup>1</sup>.

With Swift animations can be simplified even more. Default `animationWithDiration` method is provided with different set of parameters but if you let's say want to specify animation options you will need to provide all other parameters like delay and completion handler. With Swift we can make it better by adding default values for arguments.

```swift
extension UIView {
    class func animateWithDuration(duration: NSTimeInterval = 0, delay: NSTimeInterval = 0, options: UIViewAnimationOptions = [], animations: () -> Void) {
        animateWithDuration(duration, delay: delay, options: options, animations: animations, completion: nil)
    }

    func changeAnimated(animated: Bool, delay: NSTimeInterval = 0, options: UIViewAnimationOptions = [], changes: () -> Void, completion: ((Bool) -> Void)? = nil) {
        UIView.animateWithDuration(animated ? implicitAnimationDuration : 0, delay: delay, options: options, animations: changes, completion: completion)
    }
}
```

Here we define method that instead of animation duration accepts Bool value and creates animation with implicit duration if it is true or with zero duration if it is false (which means that changes will be not animated at all). Also we define method that accepts animation block as trailing closure ignoring completion block.

#### Themes

Next thing that we can extract from view controller is setting up views appearance. First we should not hardcode UIColor values in different places in our code, all colors used in application should be specified in one place. This place can be called view theme. View theme should incapsulate all colors used by particular view. View should be able to access this colors using some tags.

```swift
protocol ColorTag {}

protocol ColorTheme {
    func colorForTag(tag: ColorTag) -> UIColor
    func mainColor() -> UIColor
}

extension ColorTheme {
    func mainColor() -> UIColor {
        return UIColor.whiteColor()
    }
}

protocol ThemedView: class {
    var theme: ColorTheme {get set}
    func updateAppearance()
}
```

Here we first define protocol for `ColorTag`. It's empty protocol cause we will use it only to annotate other types that will play role of tags (i.e. enums can be used as tags). Then we define `ColorTheme` protocol that has method to access color by tag and main color property. This main color will be used as default color.  
With that we can define color theme for `FormTextField`.

```swift
extension FormTextField {
    enum ThemeColorTag: ColorTag {
        case TintColor
        case TextColor
        case PlaceholderColor
        case LeftViewTintColor
        case RightViewTintColor
        case BackgroundColor
        case HighlightedBackgroundColor
        case InvalidIndicatorColor
    }
}

struct FormTextFieldDefaultTheme: ColorTheme {
    func colorForTag(tag: ColorTag) -> UIColor {
        if let tag = tag as? FormTextField.ThemeColorTag {
            switch tag {
            case .TextColor:
                return UIColor.whiteColor()
            case .PlaceholderColor:
                return UIColor.lightTextColor()
            case .LeftViewTintColor, .RightViewTintColor:
                return UIColor.lightTextColor()
            case .BackgroundColor:
                return UIColor(red: 103.0/255.0, green: 103.0/255.0, blue: 103.0/255.0, alpha: 1)
            case .HighlightedBackgroundColor:
                return UIColor(red: 145.0/255.0, green: 145.0/255.0, blue: 145.0/255.0, alpha: 1)
            case .InvalidIndicatorColor:
                return UIColor(red: 220.0/255.0, green: 0, blue: 0, alpha: 1)
            default: return mainColor
            }
        }
        else {
            return mainColor
        }
    }
}
```    

Using this theme we can make `FormTextFiled` to conform to `ThemedView` protocol.

```swift
extension ThemedView where Self: FormTextField {
    func attributedPlaceholder() -> NSAttributedString? {
        if let placeholder = placeholder {
            return NSAttributedString(string: placeholder, attributes: [NSForegroundColorAttributeName: theme.colorForTag(ThemeColorTag.PlaceholderColor)])
        }
        return nil
    }   
}

class FormTextField: UITextField, ThemedView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        initialized()
    }
    
    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
        initialized()
    }
    
    func initialized() {
        rightView = InvalidInputIndicator(textField: self)
        updateAppearance()
    }

    var theme: ColorTheme = FormTextFieldDefaultTheme() {
        didSet {
            updateAppearance()
        }
    }

    func updateAppearance() {
        tintColor = theme.colorForTag(ThemeColorTag.TintColor)
        textColor = theme.colorForTag(ThemeColorTag.TextColor)
        
        backgroundColor = highlighted ?
            theme.colorForTag(ThemeColorTag.HighlightedBackgroundColor) :
            theme.colorForTag(ThemeColorTag.BackgroundColor)
        
        attributedPlaceholder = attributedPlaceholder(theme)
        leftView?.tintColor = theme.colorForTag(ThemeColorTag.LeftViewTintColor)
        rightView?.tintColor = theme.colorForTag(ThemeColorTag.RightViewTintColor)
        (rightView as? InvalidInputIndicator)?.backgroundColor = theme.colorForTag(ThemeColorTag.InvalidIndicatorColor)
    }
    ...
}

class InvalidInputIndicator: UIView {
    init(textField: FormTextField) {
        super.init(frame: CGRectMake(0, 0, CGRectGetHeight(textField.bounds)/5, CGRectGetHeight(textField.bounds)/5))
        self.layer.cornerRadius = CGRectGetHeight(self.bounds) / 2
    }
    
    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
```

Now in view controller we only need to setup text fields' icons. As we load view from storyboard we can do it not in `viewDidLoad` but in observers of outlets for this views. When user will select or deselect text field we don't need to set it's background color manually. We can just set it's highlighted property and call `updateAppearance()` method.

```swift
class ViewController: UIViewController, UITextFieldDelegate {
    @IBOutlet
    var userNameInput: FormTextField! {
        didSet {
            userNameInput.leftView = UIImageView(image: UIImage(.InputEmailIcon))
            userNameInput.leftViewMode = UITextFieldViewMode.Always
            userNameInput.updateAppearance()
        }
    }

    @IBOutlet
    var passwordInput: FormTextField! {
        didSet {
            passwordInput.leftView = UIImageView(image: UIImage(.InputPasswordIcon))
            passwordInput.leftViewMode = UITextFieldViewMode.Always
            passwordInput.updateAppearance()
        }
    }
    ...
    func textFieldDidBeginEditing(textField: UITextField) {
        view.changeAnimated(true, options: [.BeginFromCurrentState]) {
            textField.highlighted = true
            (textField as? ThemedView)?.updateAppearance()
        }
    }

    func textFieldDidEndEditing(textField: UITextField) {
        view.changeAnimated(true, options: [.BeginFromCurrentState]) {
            textField.highlighted = false
            (textField as? ThemedView)?.updateAppearance()
        }
    }
    ...
}
```

The same way we can define theme for login button and change it's background color by calling `updateAppearance()` when it's highlighted state changes. But I will leave if for now as it is and in the next post will show how you can solve this case differently.


####Root view 

Currently we have our layout defined in a storyboard. Though it can be the easiest way for small applications I think that for large projects it's better to use separate xib files for each view to define layout and to use storyboards only to define workflow. Though you can say that workflow is tightly coupled with layout (and you will be probably right) I still think that it's nice to separate them. I worked on one project with bunch of screens where almost every view and all transitions were defined in one storyboard. It was a mess. To clean it up I broke it into smaller storyboards ([here](http://ilya.puchka.me/ios-storyboards-segregation/) you can read how, but iOS 9 introduces storyboards references so it should be easier now to achieve the same result). This made my life a bit easier but I still had a huge table view controller in one storyboard with ten or more cell prototypes and segues attached to them or to their subviews. It was very hard to manage. Some of my colleagues prefer not to use Interface Builder at all, but I think it is just another extreme.

We will not only move layout to separate xib file but we also will create UIView subclass for the root view. Then we can move all the code that manages subviews (text fields and buttons) there. The thing is that we easily create subclasses for our UI components like table view controllers, buttons, text fields. But almost never I've seen anyone creating subclass for root view and making it to manage it's subviews and their presentation logic instead of it's view controller. View controller should not know about any internals of it's root view, like it's subviews, their constraints or animations. View controller should only manage it's lifecycle and act as mediator between different components of business logic and presentation logic. View in turn should provide interface to change it or ask it for it's state.

To use xib file and storyboard at the same time you need few things. Fist delete root view from view controller in storyboard and override it's 'nibName' property:

```swift
class ViewController: UIViewController {
    ...
    override var nibName: String? {
        return "AuthView"
    }
    ...
}
```

Then in _AuthView.xib_ you need to set _File's Owner_ to `ViewController` and connect root view with it's view outlet. This way when system will load storyboard it will use _AuthView.xib_ to load root view and will set it's root view element as view property of view controller.

Now we can move all outlets, text view delegate callbacks and buttons actions to `AuthView`:

```swift
class AuthView: UIView, UITextFieldDelegate {
    override init(frame: CGRect) {
        super.init(frame: frame)
        self.addEndEditingTapRecognizer()
    }
    
    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
        self.addEndEditingTapRecognizer()
    }
    
    private lazy var endEditingTapRecognizer: UITapGestureRecognizer! = UITapGestureRecognizer(target: self, action: "endEditing")
    
    private func addEndEditingTapRecognizer() {
        self.addGestureRecognizer(endEditingTapRecognizer)
    }

    @objc func endEditing() {
        endEditing(true)
    }
    
    @IBOutlet
    var userNameInput: FormTextField! {
        didSet {
            userNameInput.leftView = UIImageView(image: UIImage(.InputEmailIcon))
            userNameInput.leftViewMode = UITextFieldViewMode.Always
            userNameInput.updateAppearance()
        }
    }
    
    @IBOutlet
    var passwordInput: FormTextField! {
        didSet {
            passwordInput.leftView = UIImageView(image: UIImage(.InputPasswordIcon))
            passwordInput.leftViewMode = UITextFieldViewMode.Always
            passwordInput.updateAppearance()
        }
    }

    @IBOutlet
    var loginButton: UIButton!

    @IBAction
    func loginButtonTapped(sender: UIButton) {
        endEditing()
        
        UIView.animateWithDuration(0.25, delay: 0, options: [UIViewAnimationOptions.BeginFromCurrentState], animations: { () -> Void in
            self.loginButton.backgroundColor = UIColor(red: 0, green: 122.0/255.0, blue: 255.0/255.0, alpha: 1)
            }, completion: nil)
    }

    @IBAction
    func loginButtonTouchBegin(sender: UIButton) {
        UIView.animateWithDuration(0.25, delay: 0, options: [UIViewAnimationOptions.BeginFromCurrentState], animations: { () -> Void in
            self.loginButton.backgroundColor = UIColor(red: 21.0/255.0, green: 160.0/255.0, blue: 255.0/255.0, alpha: 1)
            }, completion: nil)
    }
    
    @IBAction
    func forgottenPasswordTapped() {
        endEditing()
    }

    func textFieldDidBeginEditing(textField: UITextField) {
        self.changeAnimated(true, options: [.BeginFromCurrentState]) {
            textField.highlighted = true
            (textField as? ThemedView)?.updateAppearance()
        }
    }
    
    func textFieldDidEndEditing(textField: UITextField) {
        self.changeAnimated(true, options: [.BeginFromCurrentState]) {
            textField.highlighted = false
            (textField as? ThemedView)?.updateAppearance()
        }
    }
    
    func textFieldShouldReturn(textField: UITextField) -> Bool {
        if textField == userNameInput {
            passwordInput.becomeFirstResponder()
        }
        else {
            endEditing()
            onLoginButtonTapped?(nil)
        }
        return true
    }

    var shakeAnimation: CAKeyframeAnimation = {
        let animation = CAKeyframeAnimation(keyPath: "position.x")
        animation.values = [0, 10, -8, 4, 0]
        animation.keyTimes = [0, (1 / 6.0), (3 / 6.0), (5 / 6.0), 1]
        animation.duration = 0.2
        animation.additive = true
        return animation
    }()

    func markUserNameAsInvalid(invalid: Bool) {
        markTextField(userNameInput, asInvalid: invalid)
    }
    
    func markPasswordAsInvalid(invalid: Bool) {
        markTextField(passwordInput, asInvalid: invalid)
    }
    
    private func markTextField(textField: UITextField, asInvalid invalid: Bool) {
        if invalid {
            textField.rightViewMode = .Always
            textField.layer.addAnimation(shakeAnimation, forKey: "shake")
        }
        else {
            textField.rightViewMode = .Never
        }
    }
}
```

Notice that we also moved animations in view itself. View controller will call provided methods to mark input fields as invalid but it will be view how will decide how to present it to user.

Now view controller does not care about presentation logic of it's root view, it's subviews (we can even make them private if we want) and their animations. But also now there is no way for it to know that button was tapped. At the same time we should not add business logic (performing user login) to view. We can solve this simply by defining closure property on `AuthView` that it will call when we need to perform action on login button. View controller will set this closure to call it's `login` method. It is similar to what we've used to do in Objective-C with delegate pattern but it's simpler cause we don't need additional protocol for that. The same way we could add closure to respond to "Forgotten password" button but I will skip this.

```swift
class AuthView: UIView, UITextFieldDelegate {
    ...
    var onLoginButtonTapped: ((username: String, password: String) -> Void)?
    
    @IBAction
    func loginButtonTapped(sender: UIButton) {
        endEditing()
        
        UIView.animateWithDuration(0.25, delay: 0, options: [UIViewAnimationOptions.BeginFromCurrentState], animations: { () -> Void in
            self.loginButton.backgroundColor = UIColor(red: 0, green: 122.0/255.0, blue: 255.0/255.0, alpha: 1)
            }, completion: nil)

        onLoginButtonTapped?(username: userNameInput.text!, password: passwordInput.text!)
    }

    func textFieldShouldReturn(textField: UITextField) -> Bool {
        if textField == userNameInput {
            passwordInput.becomeFirstResponder()
        }
        else {
            endEditing()
            onLoginButtonTapped?(username: userNameInput.text!, password: passwordInput.text!)
        }
        return true
    }
}

class ViewController: UIViewController {
    ...
    var authView: AuthView! {
        return view as! AuthView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        authView.onLoginButtonTapped = login
    }
    
    func login(username:String, password: String) {
        apiClient.login(username, password: password, completion: onLoggedIn)
    }
    ...
}
```

Have you noticed how many stuff already we have moved away from view controller? Now it manages only some of view setup and business logic. Most of presentation logic have moved to view itself. And I'm sure this is the right place for it. Even if you have complex view with lot's of stuff that should change on different events coming from different parts of your app, like for example constraints, they should not be changed or accessed by view controller directly. There should be API for that provided by UIView subclass. It is commonly said that view controllers are hard to test cause of their complex lifecycle. Views have much more simple lifecycle so they are better candidates for testing and handling presentation logic. Stay tuned and check out next parts of this series.

----

1. Unfortunately it looks like you can't use `UI_APPEARANCE_SELECTOR` together with `IBInspectable` which will be ignored for properties marked with `UI_APPEARANCE_SELECTOR`. That means that you can setup views properties either with UIAppearance proxy or with Interface Builder, not with both at the same time.↩︎

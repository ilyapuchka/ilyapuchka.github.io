---
id: 5b6f5a3a9d28c70f0f015f69
title: View controller thinning. Behaviors and Interface Builder.
date: 2015-10-10T15:13:18.000Z
description: ""
tags: ""
---

In [previous post](http://ilya.puchka.me/view-controller-thinning/) I showed how you can move some presentation logic from view controller to view. Now view controller is responsible only for business logic, in this case making login request and handling its result. But now you would say: "You just moved presentation logic from controller to view. Now you have Massive View!" And you will be right. Though view is a perfect place for presentation logic that leads to that view should know everything about its subviews and it will probably change when we change something in its subviews. So in this post I will show how to make view a little bit less aware of its subviews details and how to isolate business logic from everything else. You can follow commits history in this [repo](https://github.com/ilyapuchka/ViewControllerThinning/commits/master).

<!-- description -->

#### Behaviors.

And this brings us to the concept of _behaviors_. What makes difference between values and objects is that values are inert but objects _behave_. They do something and change when you tell them. If what your object does is just some calculations than it's probably better to be a value. If your value needs to perform some _action_ apart from manipulation with its data than it's probably better to be an object. But does the behavior need to be defined in object itself? It is now. `AuthView` now defines how its subviews should behave when user taps on them or when the user input is invalid. In most cases it will be fine and acceptable. But if because of that your view becomes to complex then it's probably time to refactor and to let the behaviors a green light.

First I will define what are those behaviours in case of `AuthView`. The most obvious one is highlighting behavior. When user taps on a button or when it changes input context from one text field to another these views change there background color. Cool, what's next? When user press login button and his input is invalid text fields should "shake". That's also a behavior - in response to user input I add some animation to views. The last behavior is _form_ behavior. It defines what should happen when on for example pressing "Return" button on keyboard, should user move from one field to another or it will just hide the keyboard, in what order this move should happen, on what button the form is submitted or discarded.

#### Highlight behavior.

For this behavior I need to provide few things - background color for normal state, background color for highlighted state, setter for background color and setter for highlighted state. `UITextField` and `UIButton` already has properties like background color and highlighted. What's missing is ability to set background colors for different highlight state. First I will define protocol `BackgroundHighlightableView` that will provide interface required for this behavior.

    protocol BackgroundHighlightableView: class {
        var backgroundColor: UIColor? {get set}
        var backgroundColorForHighlightedState: UIColor? {get}
        var backgroundColorForNormalState: UIColor? {get}
        
        var highlighted: Bool {get set}
        func setHighlighted(highlighted: Bool, animated: Bool)
        func backgroundColor(highlighted: Bool) -> UIColor?
    }

Here I define only getters for `backgroundColorForHighlightedState` and `backgroundColorForNormalState` cause I'm not gonna use this protocol to change this properties, but in concrete implementation I will provide those setters.

Next I will define extension for this protocol when it's applied to UIView (it make less sense to apply it on anything else but we can not restrict protocol to be applied on specific types) that will provide default implementation of protocol's methods.

    extension BackgroundHighlightableView where Self: UIView {
        
        func setHighlighted(highlighted: Bool, animated: Bool) {
            let view = self as UIView
            guard backgroundColorForHighlightedState != nil &&
                view.backgroundColor != nil else {
                    return
            }
            changeAnimated(true, options: [.BeginFromCurrentState]) {
                view.backgroundColor = self.backgroundColor(highlighted)
            }
        }
        
        func backgroundColor(highlighted: Bool) -> UIColor? {
            return highlighted ? backgroundColorForHighlightedState : backgroundColorForNormalState
        }
        
    }

Note that I had to use `let view = self as UIView` (or I could use `let view = self as BackgroundHighlightableView`). I need it cause protocol and UIView both define `backgroundColor` property and for Swift referencing it with `self` will be ambiguous.

Now I can use this protocol to create subclass of `UIButton` that will conform to it.

    class HighlightableButton: UIButton, BackgroundHighlightableView {
        
        @IBInspectable
        var backgroundColorForHighlightedState: UIColor?
        
        var backgroundColorForNormalState: UIColor?
        
        override var backgroundColor: UIColor? {
            didSet {
                backgroundColorForNormalState = backgroundColorForNormalState ?? backgroundColor
            }
        }
        
        override var highlighted: Bool {
            willSet {
                setHighlighted(newValue, animated: true)
            }
        }
        
    }

For text filed I already have a subclass - `FormTextField`, so I can extend it and add conformance to `BackgroundHighlightableView`:

    extension FormTextField: BackgroundHighlightableView {
        
        var backgroundColorForHighlightedState: UIColor? {
            get {
                return self.theme.highlightedBackgroundColor
            }
        }
        
        var backgroundColorForNormalState: UIColor? {
            get {
                return self.theme.backgroundColor
            }
        }
        
        override var highlighted: Bool {
            willSet {
                setHighlighted(newValue, animated: true)
            }
        }
        
        override func resignFirstResponder() -> Bool {
            let resignedFirstResponder = super.resignFirstResponder()
            highlighted = !resignedFirstResponder
            return resignedFirstResponder
        }
        
        override func becomeFirstResponder() -> Bool {
            let becameFirstResponder = super.becomeFirstResponder()
            highlighted = becameFirstResponder
            return becameFirstResponder
        }
    
    }

You can see the difference. In `HighlightableButton` I used `IBInspectable` property to set `backgroundColorForHighlightedState`. Here I use theme to provide background colors for different states.

#### Animations

To define animation I need its duration, view to apply it on and method to apply it.

    @objc
    protocol Animation {
        var duration: Double {get}
        var view: UIView? {get}
    }
    
    extension Animation {
        func play() {
            fatalError("Concrete instances of Animation protocol should provide implementation of this method.")
        }
    }

Here I mark `Animation` protocol as `@objc` so that later I can use concrete implementation of this protocol as `IBOutlet`. If I would use it only in code it's not required. But since I mark the whole protocol with `@objc` each method will be implicitly marked with `@objc`. Then I will not be able to define default implementation for `play()` method in protocol extension (what I will do in a minute), because it's not supported yet. That's why I removed `play()` method from protocol declaration to its extension and defined implementation with assertion. I will override it anyway.

Next I will define more concrete protocol that will describe "shake" animation.

    @objc
    protocol ShakeAnimation: Animation {
        var maxOffset: Double {get set}
        var keyPath: String {get set}
    }
    
    extension ShakeAnimation {
        func play() {
            guard let view = view else { return }
            
            let animation = CAKeyframeAnimation(keyPath: keyPath)
            animation.values = [0, maxOffset, -0.8 * maxOffset, 0.4 * maxOffset, 0]
            animation.keyTimes = [0, (1 / 6.0), (3 / 6.0), (5 / 6.0), 1]
            animation.duration = duration ?? view.implicitAnimationDuration
            animation.additive = true
            view.layer.addAnimation(animation, forKey: "shake")
        }
    }

It's again marked with `@objc` to be used in Interface Builder. Here I define a keyPath that will be animated. I don't care if it is "position.x" or "position.y" or even "transform.rotation.z", I let clients of this protocol to define that. And I provide default implementation of "shake" animation which is pretty straight forward.

Now I need concrete implementation of `ShakeAnimation` protocol. I already have default implementation of `play()` function, so I need only to define properties and their default values.

    class ShakeAnimationImp: NSObject, ShakeAnimation {
        
        @IBInspectable
        var duration: Double = 0.2
        
        @IBInspectable
        var maxOffset: Double = 10
        
        @IBInspectable
        var keyPath: String = "position.x"
        
        @IBOutlet
        weak var view: UIView?
        
    }

Now I need to hook it up with view. To do that I will use Interface Builder. I need just to drag two objects of `ShakeAnimationImp` in `AuthView` xib and connect their view outlets with each of text fields. In `FormTextField` itself I need to have reference to animation object to call its `play()` method when I need to, so I will just add outlet for that property and will connect it with animation objects. I will add `invalidInput` property to `FormTextField` to incapsulate this behavior in view itself.

        @IBOutlet
        var shakeAnimation: ShakeAnimation?
        
        var invalidInput: Bool = false {
            didSet {
                rightViewMode = invalidInput ? .Always : .Never
                if invalidInput {
                    shakeAnimation?.play()
                }
            }
        }

Now view controller only needs to call `authView.userNameInput.invalidInput = true|false` to trigger animation and show/hide invalid input indicator.

#### Form behavior.

The last behavior that I will add is form behavior. Each form should have fields, optional current field, method to move user input focus to the next field and methods to submit form or to cancel.

    protocol FormBehaviour {
        var formFields: [UIView]! {get}
        func goToNextFormField() -> UIView?
        func currentFormField() -> UIView?
        func submitForm()
        func cancelForm()
    }

Note that `formFields` is defined as explicitly unwrapped optional property and not a function because I want to use it in Interface Builder again and want be able to use IBOutlet collection for this property. If I would use method like `formField() -> [UIView]` to use this protocol with InterfaceBuilder I would need to define property with some other name (Swift will not let you define property and at the same type function with no arguments, the same return type as property type and the same name as property) and return its value in this method.

It's very likely that each form will have the same logic for moving from one field to another, so here I can use protocol extension again and define default implementation, shared among all kinds of forms. Property for current field can be also implemented in this extension cause only the field which is a first responder can be current.

    extension FormBehavior {
        
        func currentFormField() -> UIView? {
            for field in formFields where field.isFirstResponder() {
                return field
            }
            return nil
        }
        
        func goToNextFormField() -> UIView? {
            guard let
                formFields = self.formFields,
                currentField = currentFormField(),
                currentFieldIndex = formFields.indexOf(currentField)
                where
                formFields.count > 1
                else {
                    return nil
            }
            
            var nextFormField: UIView! = nil
            var nextIndex = currentFieldIndex
            repeat {
                nextIndex = (nextIndex + 1) % formFields.count
                nextFormField = formFields[nextIndex]
            } while nextFormField.canBecomeFirstResponder() == false && nextIndex != currentFieldIndex
            if nextIndex != currentFieldIndex {
                nextFormField.becomeFirstResponder()
            }
            return nextFormField
        }
        
    }

Next I need to define behavior specific to user login form. Here I have two options - to define this behavior as protocol and conform to it in view controller or to define a separate object that conforms to `FormBehavior` and use composition in view controller by referencing this object in property. First one is very tempting but that will lead me away from initial goal - to remove stuff from view controller. Also it will be harder to test this behavior cause it will require view controller (I still tried that way and you can check out code for this path in this [branch](https://github.com/ilyapuchka/ViewControllerThinning/tree/auth-behaviour-as-protocol)). So the latter path looks preferable. It will let me later to test this behavior independently from view controller and I will be able to use Interface Builder to inject it in view controller.

    class AuthFormBehaviour: NSObject, FormBehaviour {
        
        var apiClient: APIClient = APIClient(baseURL: NSURL(string: "http://localhost")!)
        
        @IBOutlet
        var userNameInput: UITextField! {
            didSet {
                userNameInput.delegate = self
            }
        }
        
        @IBOutlet
        var passwordInput: UITextField! {
            didSet {
                passwordInput.delegate = self
            }
        }
        
        @IBOutlet
        var formFields: [UIView]!
        
        @IBAction
        func submitForm() {
            guard let
                username = userNameInput.text,
                password = passwordInput.text else {
                    return
            }
            userNameInput.endEditing(true)
            passwordInput.endEditing(true)
            login(username, password: password)
        }
        
        var onCancel: (()->())?
        
        @IBAction
        func cancelForm() {
            onCancel?()
        }
        
        var onLoggedIn: ((error: NSError?, performedRequest: Bool) -> ())?
    
        func login(username: String, password: String) {
            apiClient.login(username, password: password) { [weak self] (error, performedRequest) -> () in
                self?.onLoggedIn?(error: error, performedRequest: performedRequest)
            }
        }
        
    }
    
    extension AuthFormBehaviour: UITextFieldDelegate {
        
        func textFieldShouldReturn(textField: UITextField) -> Bool {
            if textField == formFields.last {
                submitForm()
            }
            else {
                goToNextFormField()
            }
            return true
        }
    }

Everything is very straight forward here. I define that when form is submitted login request is performed and when it finishes I call `onLoggedIn` handler.

Now I can add this object in `AuthView` xib, connect its outlets and actions. Only thing that I need to add in view controller is a property to hold this behavior and set up its `onLoggedIn` handler.

        @IBOutlet
        var formBehavior: AuthFormBehavior! {
            didSet {
                formBehavior?.onLoggedIn = {[unowned self] in self.handleLogin($0, performedRequest: $1)}
            }
        }

#### Clean up

The code looks much more cleaner already. To clean up view controller completely I will refactor error handling.  
The only thing that view controller should do when login completes is to display error message if there was error and say to input fields that they have invalid input. It should not inspect error for that. Instead I can provide extension of `NSError` with methods that will determine what kind of error I have.

    extension NSError {
        
        var underlyingError: NSError? {
            return userInfo[NSUnderlyingErrorKey] as? NSError
        }
        
        var userReadableMessage: String? {
            return userInfo[NSLocalizedDescriptionKey] as? String ?? NSLocalizedString("Something went wrong.", comment: "")
        }
        
        var alertMessage: String? {
            return userReadableMessage
        }
        
        func isInvalidUserNameError() -> Bool {
            return domain == NetworkErrorDomain && underlyingError?.code == NetworkErrorCode.InvalidUserName.rawValue
        }
        
        func isInvalidPasswordError() -> Bool {
            return domain == NetworkErrorDomain && underlyingError?.code == NetworkErrorCode.InvalidPassword.rawValue
        }
    }
    
    extension UIViewController {
        
        func displayError(error: NSError) {
            let alert = UIAlertController(title: NSLocalizedString("Error", comment: ""), message: error.alertMessage, preferredStyle: UIAlertControllerStyle.Alert)
            alert.addAction(UIAlertAction(title: NSLocalizedString("Close", comment: ""), style: UIAlertActionStyle.Cancel, handler: nil))
            presentViewController(alert, animated: true, completion: nil)
        }
        
    }

Here I also define extension for `UIViewController` with method to display basic alert.

#### Conclusion

As you can see the original code changed a lot by this point. You could say that now there is much more code to support (and test). Yes, but as for me this code makes more sense, it's easy to follow though it's modular, it's testable, and what's more important, business logic is separated from everything else. I also heavily used Interface Builder to connect different components with each other. I could achieve the same result with code (and in next post I will show how) what has some advantages but with option to use Interface Builder, like it or not, we have more flexibility in how we implement things.

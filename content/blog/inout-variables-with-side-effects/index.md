---
id: 5b6f5a3a9d28c70f0f015f7e
title: Inout variables with side effects
date: 2016-12-15T13:12:17.000Z
description: ""
tags: ""
---

Every app has some kind of caching. Let's say our caching strategy is very simple:

<!-- description -->

- check if data is in the memory cache and return it
- if not - make a network call and cache the result when it's done

For that you can write code that will probably look something like this:

    if let cached = store.menuPreferences {
        dispatch_async(dispatch_get_main_queue()) {
            completion(preferences: cached, error: nil)
        }
    } else {
        repository.getMenuPreferences({ (preferences, error) in
            if let preferences = preferences {
                self.store.setMenuPreferences(preferences)
            }
            completion(preferences: preferences, error: error)
        })
    }

Pretty simple and straight forward. But what if you need to add caching for another piece of data? And another, and another and so on and on. Having to repeat this check-cache-or-make-request dance is just boring. So let's improve it and extract common logic to a method.

    func serveCached<T>(inout cached: T?, @noescape updateCache: ((T?, ErrorType?)->())->(), completion: (T?, ErrorType?)->()) {
        if let cached = cached {
            dispatch_async(dispatch_get_main_queue()) {
                completion(cached, nil)
            }
        } else {
            updateCache({ response, error in
                if let response = response {
                    cached = response
                }
                completion(response, error)
            })
        }
    }
    
    var preferences: MenuPreferences? {
        get { return self.store.menuPreferences }
        set { self.store.setMenuPreferences(newValue ?? []) }
    
    serveCached(&preferences, updateCache: repository.getMenuPreferences, completion: completion)

What we are doing here is that we are trying to use `inout` variable to wrap access to the storage. We do that by defining custom accessors for it. Yes, right on the local variable! (`willSet` and `didSet` will work exactly the same way). This way we will have a side effect on assignment. Then we pass it to the method, read from it and later assign new value to it.

Looks cool! Except that it will not work. To be more precise it will work only if `inout` variable is not captured by the code block that escapes. So if what you do in `updateCache` is synchronous then it will work. But most likely it will be asynchronous and in this case the closure passed to `updateCache` will need to escape. Here is the [proposal](https://github.com/apple/swift-evolution/blob/master/proposals/0035-limit-inout-capture.md) for Swift 3 that explains what happens here and says:

> ... an `inout` parameter is captured as a **shadow copy** that is written back to the argument when the callee returns. This allows `inout` parameters to be captured and mutated with the expected semantics when the closure is called while the inout parameter is active... But this leads to unintuitive results when the closure escapes, since the _shadow copy_ is persisted independently of the original argument.

But no worries! There is nothing here that can not be fixed with a simple boxing. Instead of passing `inout` variable to the method we will pass it a variable that boxes accessors instead:

    final class Variable<T> {
    
        let get: () -> T?
        let set: (T?) -> ()
        
        init(get value: () -> T?, set: (T?) -> ()) {
            self.get = value
            self.set = set
        }
    }

With this simple class we need to make some trivial changes in `serveCached` method and the calling part stays almost the same:

    let preferences = Variable(
        get: { self.store.menuPreferences },
        set: { self.store.setMenuPreferences(newValue ?? []) }
    )
    
    serveCached(preferences, updateCache: repository.getMenuPreferences, completion: completion)

#### Conclusion

In Swift it's very common that such simple box classes become very helpful. In my current project besides this one and a trivial `Box` class we also use such boxes as `NSCodingBox` and `Cached` which save us from writing a lot of boilerplate. And the fact that in Swift we can use setters and observers for local variables just the same way as for properties also allows for some neat code improvements.

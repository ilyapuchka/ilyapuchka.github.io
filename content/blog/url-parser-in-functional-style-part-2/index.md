---
id: 5b6f5a3a9d28c70f0f015f87
title: URL parser in functional style. Part 2.
date: 2017-11-07T19:56:44.000Z
description: ""
tags: ""
---

[In previous part](http://ilya.puchka.me/url-parser-in-swift-functional-style-part-1/) we started to write base components of URL parser. Time to extend it and add some additional functionality, like conditional, optional and wildcard patterns.

<!-- description -->

#### Conditional pattern

This pattern should parse either one pattern or another. This kind of parameter type can be expressed with `Either<A, B>` type defined as a simple generic enum with two cases.

```swift
    enum Either<A, B> {
        case left(A), right(B)
    }
```

Using this type we can compose parser and printer. Parser will try to parse left pattern first and return matched value wrapped in `Either.left`, otherwise it will parse right pattern and return matched value wrapped in `Either.right`. Printer will pattern match this value and will print left or right pattern.

```swift
    func parseEither<L, R, S>(_ lhs: RoutePattern<L, S>, _ rhs: RoutePattern<R, S>) -> Parser<Either<L, R>> {
        return {
            lhs.parse($0).map({ ($0.rest, Either.left($0.match)) })
                ?? rhs.parse($0).map({ ($0.rest, Either.right($0.match)) })
        }
    }
    
    func printEither<L, R, S>(_ lhs: RoutePattern<L, S>, _ rhs: RoutePattern<R, S>) -> Printer<Either<L, R>> {
        return {
            switch $0 {
            case let .left(a): return lhs.print(a)
            case let .right(b): return rhs.print(b)
            }
        }
    }
    
    func templateOr<A, B, S>(_ lhs: RoutePattern<A, S>, _ rhs: RoutePattern<B, S>) -> String {
        return "(\(lhs.template)|\(rhs.template))"
    }
```

With that we can now define operator for this kind of composition.

```swift
    extension RoutePattern {
    
        static func |<B>(lhs: RoutePattern, rhs: RoutePattern<B, S>) -> RoutePattern<Either<A, B>, S> {
            return .init(parse: parseEither(lhs, rhs), print: printEither(lhs, rhs), template: templateOr(lhs, rhs))
        }
    
    }
```

For `Void` types we need again to handle composition separately, but we only need to handle one case when `Void` is on both sides. In case if `Void` is on one side we will have `Either<Void, A>` or `Either<A, Void>` type in which we can not easily get rid of `Void`.

```swift
    func parseAny<A, S>(_ lhs: RoutePattern<A, S>, _ rhs: RoutePattern<A, S>) -> Parser<A> {
        return { lhs.parse($0) ?? rhs.parse($0) }
    }
    
    func printAny<A, S>(_ lhs: RoutePattern<A, S>, _ rhs: RoutePattern<A, S>) -> Printer<A> {
        return { lhs.print($0) ?? rhs.print($0) }
    }
    
    extension RoutePattern where A == Void, S == Path {
        
        static func |(lhs: RoutePattern, rhs: RoutePattern) -> RoutePattern {
            return .init(parse: parseAny(lhs, rhs), print: printAny(lhs, rhs), template: templateOr(lhs, rhs))
        }
        
    }
```

With that we can define more complex patterns like this:

```swift
    let profileRoute = lit("users") /> (string >/> lit("profile") | lit("me"))
    
    let url = URL(string: "appscheme://users/username/profile")!
    
    let parsed = profileRoute.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), .left("username"))
    
    let url = URL(string: "appscheme://users/me")!
    
    let parsed = profileRoute.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), .right(()))
    
    let printed = profileRoute.print(.left("username"))
    // printed = (path: ["users", "username", "profile"], query: [:])
    
    let printed = profileRoute.print(.right(()))
    // printed = (path: ["users", "me"], query: [:])
    
    let template = profileRoute.template
    // template = "users/(:string/profile|me)"
```

In this case we define pattern for `Either<String, Void>`, but for this kind of cases it might be better to use optional pattern.

#### Optional pattern

This pattern should succeed parsing and printing even if it actually failed. For that type of pattern parameter should be `A?`. We will create this pattern with a simple function that will wrap another patter with parameter type `A`.

```swift
    func maybe<A, S>(_ route: RoutePattern<A, S>) -> RoutePattern<A?, S> {
        return .init(parse: { url in
            guard let result = route.parse(url) else { return (url, nil) }
            return (result.rest, result.match)
        }, print: {
            return $0.flatMap(route.print)
        }, template: "(\(route.template))")
    }
```

Note that in parser we can not just return `result`, as its type will be `(RouteComponents, A)` but we need to return `(RouteComponents, A?)`, so we have to deconstruct and construct tuple again.

`Void` parameter type again requires special attention. It does not make much sense to have pattern with `Void?` parameter type, we can just keep `Void`.

```swift
    func maybe(_ route: RoutePattern<Void, Path>) -> RoutePattern<Void, Path> {
        return .init(parse: { route.parse($0) ?? ($0, ()) }, print: route.print, template: "(\(route.template))")
    }
```

With that we can define patterns composition:

```swift
    infix operator /? : MultiplicationPrecedence
    
    extension RoutePattern where S == Path {
        
        static func /?(lhs: RoutePattern, rhs: RoutePattern<Void, S>) -> RoutePattern {
            let rhs = maybe(rhs)
            return .init(parse: parseLeft(lhs, rhs), print: printLeft(lhs, rhs), template: templateAnd(lhs, rhs))
        }
        
        static func /?(lhs: RoutePattern<Void, S>, rhs: RoutePattern) -> RoutePattern<A?, S> {
            let rhs = maybe(rhs)
            return .init(parse: parseRight(lhs, rhs), print: printRight(lhs, rhs), template: templateAnd(lhs, rhs))
        }
        
        static func /?<B>(lhs: RoutePattern, rhs: RoutePattern<B, S>) -> RoutePattern<(A, B?), S> {
            let rhs = maybe(rhs)
            return .init(parse: parseBoth(lhs, rhs), print: printBoth(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    
    }
```

With this operator we hide wrapping of right pattern in a `maybe` function and make its usage more natural. Similar operators we can define for query patterns:

```swift
    infix operator .?? : MultiplicationPrecedence
    infix operator &? : MultiplicationPrecedence
    
    extension RoutePattern where S == Query {
        
        public static func .??(lhs: RoutePattern<Void, Path>, rhs: RoutePattern) -> RoutePattern<A?, Query> {
            let rhs = maybe(rhs)
            return .init(parse: parseRight(lhs, rhs), print: printRight(lhs, rhs), template: templateAnd(lhs, rhs))
        }
        
        public static func .??<B>(lhs: RoutePattern<B, Path>, rhs: RoutePattern) -> RoutePattern<(B, A?), Query> {
            let rhs = maybe(rhs)
            return .init(parse: parseBoth(lhs, rhs), print: printBoth(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    
        public static func &?<B>(lhs: RoutePattern, rhs: RoutePattern<B, Query>) -> RoutePattern<(A, B?), Query> {
            let rhs = maybe(rhs)
            return .init(parse: parseBoth(lhs, rhs), print: printBoth(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    
    }
```

#### Wildcard pattern

This pattern will be the most complicated. First we need to introduce two more state of a pattern: one that marks that subsequent pattern is required - `AnyStart` and one that marks that pattern ends with any path - `AnyEnd`.

```swift
    protocol AnyPattern {}
    enum AnyStart: AnyPattern, OpenPatternState {}
    enum AnyEnd: AnyPattern, ClosedPathPatternState {}
```

Lets start with Wildcard pattern used in the end of the path.

```swift
    public let any: RoutePattern<Void, AnyEnd> = {
        return .init(parse: { route in
            guard route.path.first != nil else { return nil }
            return (([], route.query), ())
        }, print: { _ in
            return (["*"], [:])
        }, template: "*")
    }()
```

Type of the pattern is `RoutePattern<Void, AnyEnd>` because we are not going to extract any parameters from it and we should not allow any other path patterns after it, so it's status should be "closed" but different from `Path`.  
To parse it we just check if there are any paths left. If there is none we fail (wildcard pattern requires at least one more path component), otherwise we drop all the components left in the path and only keep query.

We can now define composition for route with wildcard pattern, nothing special here:

```swift
    extension RoutePattern where S == Path {
    
        // string /> any
        static func />(lhs: RoutePattern<Void, Path>, rhs: RoutePattern<A, AnyEnd>) -> RoutePattern<A, AnyEnd> {
            return .init(parse: parseRight(lhs, rhs), print: printRight(lhs, rhs), template: templateAnd(lhs, rhs))
        }
        
        // param >/> any
        static func >/>(lhs: RoutePattern<A, Path>, rhs: RoutePattern<Void, AnyEnd>) -> RoutePattern<A, AnyEnd> {
            return .init(parse: parseLeft(lhs, rhs), print: printLeft(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    }
```

In the case when wildcard used before other pattern we will define a function that accepts next pattern. As wildcard means that there can be any kind of path components before next pattern we will simply try to match next pattern until it succeeds. If it fails we will drop path component and try again until it matches or we reach the end of the path.

```swift
    func any<A>(_ next: RoutePattern<A, Path>) -> RoutePattern<A, AnyStart> {
        return .init(parse: { route in
            // there should be at least one path component before `next`, so we drop it from the beginning
            for index in route.path.dropFirst().indices {
                // try match the rest of pattern with the rest of path
                let rest = route.path.suffix(from: index)
                if let nextResult = next.parse((Array(rest), route.query)) {
                    return nextResult
                }
            }
            return nil
        }, print: {
            guard let nextResult = next.print($0) else { return nil }
            return (["*"] + nextResult.path, [:])
        }, template: "*/\(next.template)")
    }
```

First we define composition when wildcard is used at start of path as it's the simplest case:

```swift
    extension RoutePattern where S == Path {
    
        // any /> something
        static func />(lhs: @escaping (RoutePattern) -> RoutePattern<A, AnyStart>, rhs: RoutePattern) -> RoutePattern {
            let route = lhs(rhs)
            return .init(parse: route.parse, print: route.print, template: route.template)
        }
    
    }
```

This pattern accepts `any` pattern as first parameter and right pattern. Note that though `lhs` parameter type is a closure it has the same signature as `func any<A>(_ next: RoutePattern<A, Path>) -> RoutePattern<A, AnyStart>`, so it means that we can pass `any` function to it. Then we pass right pattern to this function so that we get a pattern that will match it. But as it has `AnyStart` state but we need tor return pattern with `Path` state we construct a new pattern.

Now we can define patterns with wildcard pattern at start and end of path:

```swift
    let anyStart = any /> lit("users")
    let anyEnd = lit("users") /> any
    
    let url = URL(string: "appscheme://something/users")!
    
    let parsed = anyStart.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), ())
    
    let url = URL(string: "appscheme://users/something")!
    
    let parsed = anyEnd.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), ())
    
    let printed = anyStart.print(())
    // printed = (path: ["*", "users"], query: [:])
    
    let printed = anyEnd.print(())
    // printed = (path: ["users", "*"], query: [:])
    
    let template = anyStart.template
    // template = "*/users"
    
    let template = anyEnd.template
    // template = "users/*"
```

For the most complicated case when wildcard is used in the middle of the path we will need a small helper that will be able to "consume" the subsequent pattern to produce a new pattern:

```swift
    struct AwaitingPattern<LeftType, RightType, ResultType> {
        let consume: (RoutePattern<RightType, Path>) -> RoutePattern<ResultType, Path>
    }
```

For composition we need to define two operators:

```swift
    extension RoutePattern where S == Path {
    
        // param >/> any (>/> param)
        static func >/><B>(lhs: RoutePattern<A, Path>, rhs: @escaping (RoutePattern<B, Path>) -> RoutePattern<B, AnyStart>) -> AwaitingPattern<A, B, (A, B)> {
            return .init {
                let rhs = rhs($0)
                return .init(parse: parseBoth(lhs, rhs), print: printBoth(lhs, rhs), template: templateAnd(lhs, rhs))
            }
        }
        
        // (param >/> any) >/> param
        static func >/><B>(lhs: AwaitingPattern<A, B, (A, B)>, rhs: RoutePattern<B, Path>) -> RoutePattern<(A, B), Path> {
            return lhs.consume(rhs)
        }
    
    }
```

First function accepts left pattern with parameter of type `A` and `any` function that expects next pattern with parameter type `B`. This function returns `AwaitingPattern`. It has left type of `A`, right type of `B` and the result type of `(A, B)` as it will be actual pattern result after all the components are concatenated.

Second function accepts `AwaitingPattern` that we got from first function and a pattern with parameter type `B`. As a result it produces composed pattern of type `(A, B)`. This way we actually concatenate three patterns, one of the left side, wildcard itself, and one on the right side.

```swift
    let anyMiddle: RoutePattern<(Int, String), Path> = int >/> any >/> string
```

We have to handle `Void` types separately again, for both cases - `Void` on the left and `Void` on the right:

```swift
    extension RoutePattern where S == Path {
    
        // string /> any (/> param)
        static func />(lhs: RoutePattern<Void, Path>, rhs: @escaping (RoutePattern<A, Path>) -> RoutePattern<A, AnyStart>) -> AwaitingPattern<Void, A, A> {
            return .init {
                let rhs = rhs($0)
                return .init(parse: parseRight(lhs, rhs), print: printRight(lhs, rhs), template: templateAnd(lhs, rhs))
            }
        }
        
        // (string />) any /> param
        static func />(lhs: AwaitingPattern<Void, A, A>, rhs: RoutePattern<A, Path>) -> RoutePattern {
            return lhs.consume(rhs)
        }
    
        // param >/> any (>/> string)
        static func >/>(lhs: RoutePattern, rhs: @escaping (RoutePattern<Void, Path>) -> RoutePattern<Void, AnyStart>) -> AwaitingPattern<A, Void, A> {
            return .init {
                let rhs = rhs($0)
                return .init(parse: parseLeft(lhs, rhs), print: printLeft(lhs, rhs), template: templateAnd(lhs, rhs))
            }
        }
        
        // (param >/>) any >/> string
        static func >/>(lhs: AwaitingPattern<A, Void, A>, rhs: RoutePattern<Void, Path>) -> RoutePattern<A, Path> {
            return lhs.consume(rhs)
        }
    
    }
```

In case we have `Void` on the left the resulting type of pattern parameter will be type of right pattern. In case we have `Void` on the right - it will be type of left pattern. Implementations are trivial in both cases, we just need to get types right.

#### Router

The last component of the puzzle is a router, object that holds mapping between routes and patterns and uses it match URLs or print URLs for routes. To hold this map we could use array or dictionary, but instead we will reuse `RoutePattern` and its composition. When first pattern will be registered for some route we will store a reference to it. When new pattern is added we will compose it with current pattern in a way similar to how we composed pattern for `Either`. This is similar to how you can replace loop with recursion.

```swift
    class Router<U: Route> {
        private var route: RoutePattern<U, Path>?
    
        private func add(_ route: RoutePattern<U, Path>) -> Router {
            self.route = self.route.map({ oldValue in
                .init(parse: { oldValue.parse($0) ?? route.parse($0) },
                      print: { oldValue.print($0) ?? route.print($0) },
                      template: "\(oldValue.template)\n\(route.template)")
            }) ?? route
            return self
        }
    
    }
```

One important thing to note here is generic type of `Router`. It should conform to special protocol `Route`:

```swift
    protocol Route: Equatable {
        func deconstruct<A>(_ constructor: ((A) -> Self)) -> A?
    }
```

It requires only one function that accepts some generic "constructor" that converts generic type `A` to `Self` and returns this generic parameter back. You'll see why it's needed and hot it is used in a minute.

So we have now `RoutePattern<U, Path>` that we can use for matching. `U` here stands for the type of the route (or intent) that we defined in the beginning of first part:

```swift
    enum Route {
      case showMyProfile
      case showProfile(userId: String)
      case follow(userId: String)
      case retweet(tweetId: Int)
      case showUserTweet(userId: String, tweetId: Int)
    }
```

Let's define some possible patterns for these routes:

```swift
    let showMyProfile: RoutePattern<Void, Path> = lit("users") /> lit("me")
    let showProfile: RoutePattern<String, Path> = lit("users") /> string >/> lit("profile") 
    let follow: RoutePattern<String, Path> = lit("users") /> string >/> lit("follow")
    let retweet: RoutePattern<Int, Query> = lit(retweet) .? int("tweetId")
    let showUserTweet: RoutePattern<(String, Int), Path> = lit("users") /> string >/> lit("tweets") >/> int
```

As you can see generic types of these patterns do not match type `U` which our router expects. So how do we actually register them?

For that we need to "map" patterns over their parameter type. But this should be a special kind of map, that can do transformation on both directions. We need that to be able to map tuple of associated values to enum case and convert enum case back to tuple of its associated values. We do that using already familiar `apply` and `unapply` functions.

```swift
    extension RoutePattern {
    
        func map<B, S>(_ apply: @escaping (A) -> B?, _ unapply: @escaping (B) -> A?) -> RoutePattern<B, S> {
            return .init(parse: {
                guard let result = self.parse($0), let value = apply(result.match) else { return nil }
                return (result.rest, value)
            }, print: {
                guard let value = unapply($0) else { return nil }
                return self.print(value)
            }, template: template)
        }
    
    }
```

So to map pattern of type `A` to pattern of type `B` we need functions that can convert `A` to `B` and `B` to `A`. Their result types are optional as we allow this transformations to fail so that we can fail parsing or printing.

Let's now use this function to register a simplest pattern:

```swift
    extension Router {
    
        @discardableResult
        func add<S: ClosedPatternState>(_ intent: U, route: RoutePattern<Void, S>) -> Router {
            return add(route.map({ intent }, { $0 == intent ? () : nil }))
        }
    
    }
```

Here we are using `map` to create a new pattern that will convert `Void` to `U`, for which we just need to return value of `U` that we got as input parameter. For printing we need to check that parameter sent to print, `U` is equal to intent that we are registering this pattern for.

Here is how we use it:

```swift
    let router = Router<Routes>()
    router.add(Routes.showMyProfile, route: lit("users") /> lit("me"))
    
    let url = URL(string: "appscheme://users/me")!
    
    let parsed = router.route.parse(url.components)
    // parsed = Routes.showMyProfile
    
    let printed = router.route.print(Routes.showMyProfile)
    // printed = (path: ["users", "me"], query: [:])
```

Let's now try to register route with one parameter:

```swift
    extension Router {
    
        @discardableResult
        func add<A, S: ClosedPatternState>(_ intent: @escaping ((A)) -> U, route: RoutePattern<A, S>) -> Router {
            return add(route.map({ intent($0) }, { ??? }))
        }
    
    }
```

The input parameter of this function is a function that accepts parameter `A` and returns `U`. For that we can use enum cases constructor. I.e. `Routes.showProfile` has type of `(String) -> Routes`, `Routes.showUserTweet` has type of `(String, Int) -> Routes`. So to map `A` to `U` we just need to pass `A` to this constructor to get `U`.

But how do we get `A` from value of `U`. Essentially it will mean that we need to extract associated values from value of enum. In Swift we usually do that with `if case let`:

```swift
    if case let .showProfile(userId) = value { ... }
```

But we can't use this inside `unapply` closure, because we don't know to what case to match the value, we only get it's constructor. We can't write something like `if case intent = value`, it just does not make sense. So how do we solve that? That's where our `deconstruct` function comes in. It accepts `(A) -> Self` as parameter. That's exactly the signature of our input `intent` parameter, so the only thing we can do is to pass it in. As a result we will get `A?`, that's exactly what we need to return from unapply function, so everything matches!

```swift
    extension Router {
    
        @discardableResult
        func add<A, S: ClosedPatternState>(_ intent: @escaping ((A)) -> U, route: RoutePattern<A, S>) -> Router {
            return add(route.map({ intent($0) }, { $0.deconstruct(intent) }))
        }
    
    }
```

Now let's see how we can implement this function:

```swift
    extension Routes: Route {
    
        func deconstruct<A>(_ constructor: ((A) -> Routes)) -> A? {
            switch self {
               ???
            }
        }
    }
```

The point of this method is to extract associated values from enum value in case it matches the constructor. So first we extract values from each case:

```swift
    switch self {
        case let .showProfile(values): ...
        case let .follow(values): ...
        case let .retweet(values): ...
        case let .showUserTweet(values): ...
        default: ...
    }
```

What we can do now with these extracted associated values. We can try to simply return them, but we can't as their type does not match generic parameter `A`.

```swift
    switch self {
        case let .showProfile(values): return values // error: Cannot convert return expression of type 'String' to return type 'A?'
        ...
    }
```

To solve that we should use less known feature of pattern matching - matching by type:

```swift
    switch self {
        case let .showProfile(values as A): return values
        case let .follow(values as A): return values
        case let .retweet(values as A): return values
        case let .showUserTweet(values as A): return values
        default: nil
    }
```

This way we only match cases if type of `A` matches type of case associated values. Otherwise we sink to default case which returns `nil`.

Now everything compiles, but let's think what will happen if we just return associated values like we do now. Let's assume that we registered route `showProfile(userId: String)` in our router:

```swift
    router.add(Routes.showProfile, route: lit("users") /> string >/> lit("profile"))
```

Let's now try to print url for it.

```swift
    router.route.print(Routes.showProfile(userId: "username"))
```

This will result in call `Routes.showProfile(userId: "username").deconstruct(Routes.showProfile)` which will return `"username"`, as expected. But what if instead we pass in value of `Routes.follow("username")`?

```swift
    router.route.print(Routes.follow("username"))
```

In this case it will call `Routes.follow("username").deconstruct(Routes.showProfile)`. And as the only thing that we are doing is pattern matching we will again return `"username"`, though we should return `nil` instead as this route was never registered. It means that we need to do something more than just pattern matching - we need to check if the value created by constructor passed to `deconstruct` is actually the same value on which this method was called. In case they don't match we should return `nil` as printing should fail, in case they match we return extracted associated value.

```swift
    switch self {
        case let .showProfile(values as A) where self == constructor(values): return values
        case let .follow(values as A) where self == constructor(values): return values
        case let .retweet(values as A) where self == constructor(values): return values
        case let .showUserTweet(values as A) where self == constructor(values): return values
        default: nil
    }
```

> Note: as you can see we only define this method on the cases _with_ associated values, because for cases without associated values we need `A` to be `Void`, but there is no way to express it in Swift, and we will just use `==` operator in this case.

Now we not only make sure that type of associated values match `A`, but also that enum value created by constructor matches the value that we called `deconstruct` method on. Which means that we will only get associated values if we pass in to `print` the same enum value that we passed in to `add` method:

```swift
    router.add(Routes.showProfile, route: lit("users") /> string >/> lit("profile"))
    
    let printed = router.route.print(Routes.showProfile(userId: "username"))
    // printed = (path: ["users", "username", "profile"], query: [:])
    
    router.add(Routes.follow, route: lit("users") /> string >/> lit("follow"))
    
    let printed = router.route.print(Routes.follow(userId: "username"))
    // printed = (path: ["users", "username", "follow"], query: [:])
```

Cool! Almost there!

Now let's see how do we register route with two parameters:

```swift
    extension Router {
    
        @discardableResult
        func add<A, B, S: ClosedPatternState>(_ intent: @escaping ((A, B)) -> U, route: RoutePattern<(A, B), S>) -> Router {
            return add(route.map({ intent($0) }, { $0.deconstruct(intent) }))
        }
    
    }
```

Exactly the same, except our parameter type is now `(A, B)`. What about three parameters?

```swift
    extension Router {
    
        public func add<A, B, C, S: ClosedPatternState>(_ intent: @escaping ((A, B, C)) -> U, route: RoutePattern<((A, B), C), S>) -> Router {
            return add(route.map({ intent($0) }, { $0.deconstruct(intent) }))
        }
    
    }
```

This will not compile as we have a mismatch between type of enum constructor input values `(A, B, C)` and type of pattern parameter `((A, B), C)`. To solve that we need to define functions which will convert these types from one to another:

```swift
    func flatten<A, B, C>(_ t: ((A, B), C)) -> (A, B, C) {
        return (t.0.0, t.0.1, t.1)
    }
    
    func parenthesize<A, B, C>(_ t: (A, B, C)) -> ((A, B), C) {
        return ((t.0, t.1), t.2)
    }
```

`flatten` method gets "grouped" tuple value and flattens it to a plane tuple. `parenthesize` do the opposite, it takes "flat" tuple and groups it's element in tuples of two elements. Now we can use these functions to make compiler happy:

```swift
    extension Router {
    
        @discardableResult
        func add<A, B, C, S: ClosedPatternState>(_ intent: @escaping ((A, B, C)) -> U, route: RoutePattern<((A, B), C), S>) -> Router {
            return add(route.map({ intent(flatten($0)) }, { $0.deconstruct(intent).map(parenthesize) }))
        }
    
    }
```

Now we just need to define these methods for 4, 5 and 6 parameters (that should be enough for most cases). And we are done.

Phew! That was **a lot** of code! **A lot** of small functions! But it's very satisfying that it works in the end! Let's summarise what we have now.

#### Conclusion

The main question: is this implementation better than imperative? As always there are some profits and some drawbacks.

Pros:

- parsing became way much simpler, especially when it comes to implementing complex patterns like wildcard. It's built with very small functions which are easy to understand and test, and their composition

- it's much more type-safe, parameters can be extracted into associated values automatically (almost) instead of aggregating them in weakly typed dictionary where all values are strings and we need to manually convert their types and pass them in enum case constructor

- we got printing almost for free

Cons:

- we had to use few custom operators instead of one standard (`/`). I already mentioned a reason for that in the first part - using one operator will produce too many overloads of it and Swift will not be able to compile such expressions. Even with two custom operators compilation sometimes takes more time comparing with if we would use third, `>/` operator. Hopefully this will be possible to solve with conditional protocol conformance

- as you saw we need to write some boilerplate to get things together for printing URLs. If we don't need printing we can remove it, which will make implementation much easier: we only will need `apply` functions and we will not need `print` functions at all

- parsing is now based on recursion which can be a bit hard to wrap your head around at first. It can also come with some performance and memory overhead as we are composing functions, but I didn't perform any measurements yet

In the end I'm personally not sure about how much I'm satisfied with results. The main disadvantage for me is use of several custom operators. It's very satisfactory though that I managed to understand how to do it and learned few things along the way about composition and phantom types. Thanks to [Brandon Williams](https://twitter.com/mbrandonw) again for sharing his code and making this learning opportunity possible!

You can find all the code on [github](https://github.com/ilyapuchka/Deeper/pull/5).

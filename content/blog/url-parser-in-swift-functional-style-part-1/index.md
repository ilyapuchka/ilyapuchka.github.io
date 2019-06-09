---
id: 5b6f5a3a9d28c70f0f015f86
title: URL parser in functional style. Part 1.
date: 2017-11-07T19:56:35.000Z
description: ""
tags: ""
---

When I published one of my previous [posts about deeplinks](http://ilya.puchka.me/deeplinks-no-brainer/) and then decided to turn it into a [framework](https://github.com/ilyapuchka/Deeper) it turned out that [Brandon Williams](https://twitter.com/mbrandonw) was working on a similar thing for his [Point-Free project](https://github.com/pointfreeco/swift-web/pull/61/files), but related to parsing http requests for web framework. As parsing URLs is a subset of this problem I decided to go through his implementation and apply the same technique to rewrite parser that I have written in imperative way (and probably not in the best way) in a functional style. Just to see where it goes and as exercise in a functional programming. So here is the path I went through.

<!-- description -->

#### Problem

Let's first describe a problem. We want to write a URL parser that will give us a type-safe way to define deeplink "routes" in our app (in my previous post I call them "intents", but I will be using "routes" here). There are few design goals for that:

- each route should be defined by enum case that should correspond to some "route pattern". For example we can have our routes defined like this:

    enum Routes {
      case showMyProfile
      case showProfile(userId: String)
      case follow(userId: String)
      case retweet(tweetId: Int)
      case showUserTweet(userId: String, tweetId: Int)
    }

- route can have typed parameters extracted from path components or from query. For routes defined above we can imaging following patterns:

    /users/me
    /users/:string/profile
    /users/:string/follow
    /retweet?tweetId=:int
    /users/:string/tweets/:int

Here `:string` or `:int` stands for parameter of `String` or `Int` type. As you can see they can be defined as part of the path or query. When several parameters are defined they should strictly match types and order of associated values in the route case. This way complier will only allow us to associate routes with patterns when their parameter types match.

- 

route can have special patterns like `*` for matching any path components in the start/end/middle of the path, `()` for optional parameters, conditional pattern `this|that` that matches either left or right option

- 

it should be possible to "print" url for specific route based on the pattern it was previously associated with. This way we can not only handle deeplinks but build our entire app navigation based on URLs and perform navigation witch a call to `open(url:)`:

    let route = Routes.showUserTweet(userId: "username", tweetId: 123)
    let url = router.url(for: route)
    // url = "appscheme://users/username/tweets/123"
    router.open(url: url)

#### The ground

To start up we need to define our basic building blocks. This part I find one of the most difficult in functional programming. The basic units are so small but mean so much for a final result that it is very important, but sometimes difficult, to find a proper abstraction. Our abstractions will be the following:

- url (or route) components, consisting of array of paths and dictionary of query items.

    typealias RouteComponents = (path: [String], query: [String: String])

- parser, which is a function that takes in route components and returns the rest of them that it didn't process, along with matched value that it extracted from processed components. If parsing fails it should return `nil`.

    typealias Parser<A> = (RouteComponents) -> (rest: RouteComponents, match: A)?

- printer, that based on the input for parameter value returns route components where parameter placeholder (`/:string` or `?key=:string`) is replaced with its value (`/abc` or `?key=abc`). If printing fails it should return `nil`.

    typealias Printer<A> = (A) -> RouteComponents?

- route pattern, which contains of parser, printer and a template string:

    struct RoutePattern<A, S: PatternState> {
      let parse: Parser<A>
      let print: Printer<A>
      let template: String
    }

It has two generic parameters, `A` for type of parameter and `S` for state of pattern. This state we will model based on phantom types which we will use to define operations only possible on patterns in specific states.

    protocol PatternState {}
    protocol ClosedPatternState: PatternState {} // pattern is complete
    protocol OpenPatternState: PatternState {} // pattern requires subsequent pattern to become closed
    
    protocol ClosedPathPatternState: ClosedPatternState {}
    enum Path: ClosedPathPatternState {} // pattern only has path components
    enum Query: ClosedPatternState {} // pattern has path and query components

Here you can see that we not only define that pattern can be in `Path` or `Query` state, but also it can be `closed` or `opened`. Later we will use `opened` state to implement `*` pattern that is used in the start or middle of the pattern.

#### Path patterns

With these abstractions we can start building our patterns! There can be two types of path patterns:

- string path component (or "literal"), i.e. `/users`
- path parameter, i.e. `:string`

Let's start with a simplest literal pattern.

    func lit(_ str: String) -> RoutePattern<Void, Path> {
        return .init(parse: { route in
            guard route.path.first == str else { return nil }
            return ((Array(route.path.dropFirst()), route.query), ())
        }, print: { _ in
            return ([str], [:])
        }, template: str)
    }

To parse this pattern we should check if the first path component matches the literal and if it does we should return the rest of components, otherwise we should fail parsing by returning `nil`. No parameter value will be captured, so pattern parameter type will be `Void`. Literals can be only used in path, so the state of the pattern will be `Path`. To print the url we should just put a literal value in a path components. And the template for this pattern is just a literal itself.

With this we can already define pattern that will consist of single path component:

    let login = lit("login")
    let url = URL(string: "appscheme://login")!
    
    let parsed = login.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), ())
    
    let printed = login.print(())
    // printed = (path: ["login"], query: [:])
    
    let template = myProfile.template
    // template = "login"

Pretty cool and simple, but not very useful. So let's move on to path parameter pattern.

    func pathParam<A>(_ apply: @escaping (String) -> A?, _ unapply: @escaping (A) -> String?) -> RoutePattern<A, Path> {
        return .init(parse: { route in
            guard let pathComponent = route.path.first, let parsed = apply(pathComponent) else { return nil }
            return ((Array(route.path.dropFirst()), route.query), parsed)
        }, print: { a in
            guard let string = unapply(a) else { return nil }
            return ([string], [:])
        }, template: pathParamTemplate(A.self))
    }
    
    func pathParamTemplate<A>(_ type: A.Type) -> String {
        return ":\(typeKey(type))"
    }

This one is a bit more complicated. For that pattern to be parsed a path component, which is of `String` type, should be successfully transformed to type `A`, which can be `Int`, `Double` or `String`. For that transformation we pass in `apply` function. If this transformation fails or there is no path components left we fail parsing, otherwise we drop first path component and return parsed value for matched result. For printing we need to do a backward transformation, from value of type `A` to `String`. For that we use `unapply` function. For template string we use a simple helper that converts type to it's string representation, i.e. `String` to `:string`, `Int` to `:int`.

To simplify working with path parameters we will introduce helper functions for each type of parameter which will build up in a small DSL:

    let string = pathParam(String.init, String.init)
    
    let int = pathParam(Int.init, String.init)
    
    let double = pathParam(Double.init, String.init)

Here we provide constructors from standard library to perform transformations between type of parameter and `String`. With that we can define a simple route with a single path parameter.

    let url = URL(string: "appscheme://123")!
    
    let parsed = int.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), 123)
    
    let printed = int.print(123)
    // printed = (path: ["123"], query: [:])
    
    let template = int.template
    // template = ":int"

Again cool and simple, but still not very useful.

#### Patterns composition

To make this really useful and before we continue with query patterns we need to define a way to combine different patterns so that we can build bigger patterns.

For that we will use function composition. Route patterns essentially are just boxes of pure parser and printer functions, so they can be easily composed together. Let's look at how we can compose parsers.

    func parseBoth<L, R, LS, RS>(_ lhs: RoutePattern<L, LS>, _ rhs: RoutePattern<R, RS>) -> Parser<(L, R)> {
        return { route in
            guard let lhsResult = lhs.parse(route) else { return nil }
            guard let rhsResult = rhs.parse(lhsResult.rest) else { return nil }
            return (rhsResult.rest, (lhsResult.match, rhsResult.match))
        }
    }

Here we define a function that accepts two route patterns of any parameter type (and of any state) and returns a new parser that parses both of those patterns' values in a tuple. For that we first parse route components using left pattern, then if it succeeds we get the rest of path components and parse them with a right pattern. If it also succeeds we return the rest of path components and match result of both left and right patterns.

Printer composition is done pretty much the same way:

    func printBoth<L, R, LS, RS>(_ lhs: RoutePattern<L, LS>, _ rhs: RoutePattern<R, RS>) -> Printer<(L, R)> {
        return {
            guard let lhs = lhs.print($0.0), let rhs = rhs.print($0.1) else { return nil }
            return (lhs.path + rhs.path, lhs.query.merging(rhs.query, uniquingKeysWith: { $1 }))
        }
    }

We again get two patterns and first use left pattern to print route components using left tuple value, then we use right pattern to print route components using right tuple value. If both succeed we merge the results.

Template composition is a bit different, as template is not a function but just a `String`, but it is even simpler:

    func templateAnd<A, B>(_ lhs: RoutePattern<A, Path>, _ rhs: RoutePattern<B, Path>) -> String {
        return "\(lhs.template)/\(rhs.template)"
    }

We just get templates of both patterns and concatenate them with `/`. Another difference here is that this function can only be applied to patterns in `Path` state, because of different separators for path components (`/`) and for query components (`?` or `&`). This is one of examples of phantom types usage.

With all that we now can define a function that will "concatenate" two patterns. For that we will introduce a custom operator, so that writing it will feel more natural.

    infix operator >/> : MultiplicationPrecedence
    
    extension RoutePattern where S == Path {
        static func >/><B>(lhs: RoutePattern, rhs: RoutePattern<B, S>) -> RoutePattern<(A, B), S> {
            return .init(parse: parseBoth(lhs, rhs), print: printBoth(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    }

Again we use phantom type here to constrain this operation to patterns only in `Path` state. Implementation is trivial, we use functions that we defined before to compose parsers, printers and templates and construct a new pattern with them. What we get with this is pretty cool though. Now we can combine two patterns into one which will internally parse or print both of them and will only succeed in parsing or printing of both of them succeed. We already can build patterns for 4 of 5 routes that we defined in the beginning.

    let profileRoute = lit("users") >/> string >/> lit("profile")
    let url = URL(string: "appscheme://users/username/profile")
    
    let parsed = int.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), (((), "username"), ()))
    
    let printed = int.print((((), "username"), ()))
    // printed = (path: ["users", "username", "profile"], query: [:])
    
    let template = int.template
    // template = "users/:string/profile"

Pretty cool! Though you can spot a nasty issue here. Every time when we compose two patterns with parameter types `A` and `B` we will end up with a new pattern with parameter type `(A, B)`. If we now compose it with another pattern with parameter type `C` we will get pattern with type `((A, B), C)`. And so on. So parsing in this example will give us a value of `((Void, String), Void)`. But then we need to use this value somehow to create a case of route, as this should be the result of our "pattern matching". For this example it is `showProfile(userId: String)`. You can see that type of pattern parameter and type of route associated values do not match. We can of course redefine our route as `showProfile(((Void, String), Void))` but this is just ugly and unusable. How we can solve that?

With another custom operator! Well, to be fair, operators here are just helpers to provide more natural way of composing patterns, the solution for the problem is again in function composition.

When parsing literal patterns we are not very interested in `Void` matching result. It is just placeholder for generic type parameter. So let's drop it! To do that we need to handle three cases: when we have `Void` type on the left, on the right and on both sides. Here is our parsers composition for these cases:

    func parseLeft<L, LS, RS>(_ lhs: RoutePattern<L, LS>, _ rhs: RoutePattern<Void, RS>) -> Parser<L> {
        return { route in
            guard let result = parseBoth(lhs, rhs)(route) else { return nil }
            return (result.rest, result.match.0)
        }
    }
    
    func parseRight<R, LS, RS>(_ lhs: RoutePattern<Void, LS>, _ rhs: RoutePattern<R, RS>) -> Parser<R> {
        return { route in
            guard let result = parseBoth(lhs, rhs)(route) else { return nil }
            return (result.rest, result.match.1)
        }
    }

`parseLeft` function parses both left and right parser, but only returns matched value of left pattern. `parseRight` does the same but returns matched value of right pattern. In case we have patterns with `Void` parameter type on both sides we can use either of these functions because it does not matter if we return `Void` from left or right pattern.

Printers composition will be a bit different:

    func printLeft<L, LS, RS>(_ lhs: RoutePattern<L, LS>, _ rhs: RoutePattern<Void, RS>) -> Printer<L> {
        return { printBoth(lhs, rhs)(($0, ())) }
    }
    
    func printRight<R, LS, RS>(_ lhs: RoutePattern<Void, LS>, _ rhs: RoutePattern<R, RS>) -> Printer<R> {
        return { printBoth(lhs, rhs)(((), $0)) }
    }

Again we pass in left and right pattern, but we want a printer that will print both of them, but will only need left or right value as input. As we need values for both patterns to pass to `printBoth` printer we just create `Void` value inline.

We don't need to change anything in templates composition as it works already who we need it to work, so let's now define pattern composition:

    infix operator /> : MultiplicationPrecedence
    
    extension RoutePattern where S == Path {
    
        static func />(lhs: RoutePattern<Void, S>, rhs: RoutePattern) -> RoutePattern {
            return .init(parse: parseRight(lhs, rhs), print: printRight(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    
        static func >/>(lhs: RoutePattern, rhs: RoutePattern<Void, S>) -> RoutePattern {
            return .init(parse: parseLeft(lhs, rhs), print: printLeft(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    
    }

We introduce new operator `/>` that will be used to drop left side parameter value and will be only applicable when left pattern has `Void` parameter type. It will return pattern with only right parameter type, we achieve that by using `parseRight` and `printRight` functions.

For the case when pattern with `Void` parameter type is on the right side we reuse `>/>` operator, using `parseLeft` and `printLeft` functions.

> Note: I decided to reuse `>/>` operator here for two reasons. One is that it's better if you make user to use less custom operators. Second is that it should be easy to remember that left `>` in this operator means that left parameter type will be preserved in contrast to `/>` operator. I could define `>/` operator but it will make users think about what operator to use where. With `/>` and `>/>` you end up with `/>` only used before you introduce parameter pattern, after it you'll always use `>/>`. I also can't use just `>/>` or `/>` always as I will have too many overloads of it, which will make expressions to complex for Swift compiler.

Let's now see what we can do with that.

    let profileRoute = lit("users") /> string >/> lit("profile")
    let url = URL(string: "appscheme://users/username/profile")
    
    let parsed = profileRoute.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), "username")
    
    let printed = profileRoute.print("username")
    // printed = (path: ["users", "username", "profile"], query: [:])
    
    let template = profileRoute.template
    // template = "users/:string/profile"

Now our `profileRoute` will have type `RoutePattern<String, Path>` and we will only get single matched value from parse and need to provide only single value to print function. The same applies when we have only literal patterns:

    let myProfile = lit("users") /> lit("me")
    let url = URL(string: "appscheme://users/me")
    
    let parsed = myProfile.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), ())
    
    let printed = myProfile.print(())
    // printed = (path: ["users", "me"], query: [:])
    
    let template = myProfile.template
    // template = "users/me"

Here pattern type will be `RoutePattern<Void, Path>` instead of `RoutePattern<(Void, Void), Path>` if we would use `>/>` operator.

#### Query patterns

Now lets move on to query patterns. In queries we can only have parameter patterns, but the difference is that they are named and come in as a dictionary with their names as keys.

    func queryParam<A>(_ key: String, _ apply: @escaping (String) -> A?, _ unapply: @escaping (A) -> String?) -> RoutePattern<A, Query> {
        return .init(parse: { route in
            guard let queryValue = route.query[key], let parsed = apply(queryValue) else { return nil }
            return (route, parsed)
        }, print: { a in
            guard let value = unapply(a) else { return nil }
            return ([], [key: value])
        }, template: queryParamTemplate(A.self, key: key))
    }
    
    func queryParamTemplate<A>(_ type: A.Type, key: String) -> String {
        return "\(key)=:\(typeKey(type))"
    }

This is pretty much the same as parsing path parameters except that we are passing in the key for parameter name. We also don't necessary have to drop query components when they are parsed as we should allow any other query components in the url besides those defined in pattern. Another difference is that result of this function is a pattern in a `Query` state.

To make it easier to use this function we can define few helper methods for each of query parameter types, similar to what we did for path pattern:

    func int(_ key: String) -> RoutePattern<Int, Query> { return queryParam(key, Int.init, String.init) }
    
    func double(_ key: String) -> RoutePattern<Double, Query> { return queryParam(key, Double.init, String.init) }
    
    func bool(_ key: String) -> RoutePattern<Bool, Query> { return queryParam(key, Bool.fromString, Bool.toString) }
    
    func string(_ key: String) -> RoutePattern<String, Query> { return queryParam(key, String.init, String.init) }

Now we can define pattern composition:

    infix operator .? : MultiplicationPrecedence
    
    extension RoutePattern where S == Query {
    
        static func .?(lhs: RoutePattern<Void, Path>, rhs: RoutePattern) -> RoutePattern {
            return .init(parse: parseRight(lhs, rhs), print: printRight(lhs, rhs), template: templateAnd(lhs, rhs))
        }
        
        static func .?<B>(lhs: RoutePattern<B, Path>, rhs: RoutePattern) -> RoutePattern<(B, A), Query> {
            return .init(parse: parseBoth(lhs, rhs), print: printBoth(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    
        static func &<B>(lhs: RoutePattern, rhs: RoutePattern<B, Query>) -> RoutePattern<(A, B), Query> {
            return .init(parse: parseBoth(lhs, rhs), print: printBoth(lhs, rhs), template: templateAnd(lhs, rhs))
        }
    
    }
    
    func templateAnd<A, B, S: ClosedPathPatternState>(_ lhs: RoutePattern<A, S>, _ rhs: RoutePattern<B, Query>) -> String {
        return "\(lhs.template)?\(rhs.template)"
    }
    
    func templateAnd<A, B>(_ lhs: RoutePattern<A, Query>, _ rhs: RoutePattern<B, Query>) -> String {
        return "\(lhs.template)&\(rhs.template)"
    }

Similarly to what we did to drop `Void` parameter type in path patterns we define a function that will drop `Void` parameter of the left path pattern and will only return value of right query pattern. We also define two new variants of `templateAnd` function that uses proper separators between path and query.

Now we can build patterns not only with path components but also with query:

    let retweetRoute = lit("retweet) .? int("tweetId")
    let url = URL(string: "appscheme://retweet?tweetId=123")!
    
    let parsed = retweetRoute.parse(url.routeComponents)
    // parsed = ((path: [], query: [:]), 123)
    
    let printed = retweetRoute.print(123)
    // printed = (path: ["retweet"], query: ["tweetId": 123])
    
    let template = retweetRoute.template
    // template = "retweet?tweetId=:int"

#### Conclusion

I think this should be enough for the first part. We already achieved a lot. We can construct simple and more complicated patterns made of few smaller patterns, both with path and query parameters, and we solved the issue with unneeded `Void` types.

If that's not too much code for you already, see you in the [second part](http://ilya.puchka.me/url-parser-in-functional-style-part-2/).  
You can find all the code on [github](https://github.com/ilyapuchka/Deeper/pull/5).

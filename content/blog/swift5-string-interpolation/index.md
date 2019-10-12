---
id: 5c5a181fe50b131c1451e18a
title: Swift 5 string interpolation
date: 2019-02-06T19:30:00.000Z
description: ""
tags: ""
---

Strings are everywhere. We all use strings everyday. In Swift `String` is a very powerful type. One of the features it had available since the beginning is the string interpolation. With it we can embed any Swift expression inside the string literal instead of concatenating strings manually.

<!-- description -->

```swift
let name = "iOS Astronauts"
"Hello, \(name)" // "Hello, iOS Astronauts"
"Hello, \(name.count)" // "Hello, 14"
"Hello, \({ name })" // "Hello, (Function)"
"Hello, \(Optional.some(name))" // "Hello, Optional("Ilya")"
"Hello, \(MyStruct())" // "Hello, MyStruct()"
```

But you'll say, we all already know that and there is nothing really exciting about that. But today let's see how string interpolation works exactly.

For that standard library defines a protocol `ExpressibleByStringInterpolation`. This type was deprecated in Swift 3 so its details are now even stripped out of generated interface of standard library that you'll see in the Xcode, but we can find a cached version on swiftdoc.org[^1]. There you'll see that there are two constructors required by this protocol.

```swift
protocol ExpressibleByStringInterpolation {

    init(stringInterpolation strings: Self...)
    
    init<T>(stringInterpolationSegment expr: T)

}
```

We can also find there some details about how these constructors are being invoked.

> String interpolation is a multiple-step initialization process. When you use string interpolation, the following steps occur:
>
>    _1. The string literal is broken into pieces. Each segment of the string literal **before** , **between** , and **after** any included expressions, along with the individual expressions themselves, are passed to the `init(stringInterpolationSegment:)` initializer._
>
>    _2. The results of those calls are passed to the `init(stringInterpolation:)` initializer in the order in which they appear in the string literal._

So essentially string interpolation is just a syntactic sugar that at compile type converts expression like this:

```swift
"hello \(name)!"
```

into a call like this[^2]:

```swift
String(stringInterpolation:
    String(stringInterpolationSegment: "hello "),
    String(stringInterpolationSegment: name),
    String(stringInterpolationSegment: "!")
)
```

If we go through this generated code step by step then we see that first a string will be created with `hello` string, then another string will be created with a `name` value, and then another with `!` and only then all these strings will be passed as an array into the final constructor to create a final string.

## What now?

Cool. But what now? Well, knowing that we can now make our own types conform to this procotol.

Let's imagine we have a blog and we want to write our blog posts in Swift. Of course its not possible straight away as Swift is not a markup language and modern browsers down't understand it. But what if we convert our Swift code into the format that they can understand? For example Markdown or HTML?

That we can do. What we want to achieve is to be able to write something like this:

```swift
let blogPost: Markup = "..."

let markdow = Markdown(blogPost)

let html = HTML(blogPost)
```

Let's see how we can use string interpolation for that.

### Demo 1 ([playground](https://github.com/ilyapuchka/SwiftStringInterpolation))

So as you can see it's possible to use string interpolation for that but current design has few limitations (more details in the Swift Evolution proposal[^2]):

1. Doesn't allow extra parameters
2. Accepts any type of values
3. Lost segment semantics
4. Memory overhead

Also the best variant of our implementation that we could achieve is not perfect as well.

1. We have to use free functions for each type of element to avoid specifying the type name.
2. Function calls add extra brackets which only increase noise.
3. Free functions pollute global namespace.

But at the same time our implementation is already pretty powerful. We could even workaround some design limitation using free functions to be able to use parameters with interpolation.

Over time people came up with interesting and more useful applications of that, for example for [localization](https://gist.github.com/brentdax/79fa038c0af0cafb52dd) [^3], which was possible even in Swift 2.

```swift
let color = "blue"
let num = 42

let localized: LocalizableString = 
    "Colorless \(color) ideas sleep furiously."
// format = NSLocalizedString("Colorless %@ ideas sleep furiously.", comment: "")
// String(format: format, arguments: ["blue"])


let localized: LocalizableString = 
    "\(num.formatted("%05d")) colorless green ideas sleep furiously.")
// format = NSLocalizedString("%05d colorless green ideas sleep furiously.", comment: "")
// String(format: format, arguments: [42])
```

## Swift 5

As we saw earlier `ExpressibleByStringInterpolation` was deprecated in Swift 3 with a promiss to be redesigned in Swift 4. And finally this redesign happened in Swift 5. So let's see what have changed.

The basic concept is still the same, but the form has changed a bit. Now instead of aggregating interpolation segments in the type itself we need to use an associated type that should implement new `StringInterpolationProtocol`. The value of this type will be passsed into the new constructor `init(stringInterpolation:)` instead of array of individual segments. [^2]

```swift
public protocol ExpressibleByStringInterpolation : ExpressibleByStringLiteral {

    associatedtype StringInterpolation : StringInterpolationProtocol = DefaultStringInterpolation where Self.StringLiteralType == Self.StringInterpolation.StringLiteralType

    init(stringInterpolation: Self.StringInterpolation)
}
```

This associated type needs to implement a new constructor `init(literalCapacity: Int, interpolationCount: Int)` that accepts the combined size of all literal segments and the number of interpolation segments. Then it needs to implement the new `func appendLiteral(_: StringLiteralType)` method that will be called with each string literal segment.And then we can define our own `func appendInterpolation(...)` methods for any other type of segment we want to support. [^2]

```swift
public protocol StringInterpolationProtocol {
    associatedtype StringLiteralType : _ExpressibleByBuiltinStringLiteral

    init(literalCapacity: Int, interpolationCount: Int)

    mutating func appendLiteral(_ literal: Self.StringLiteralType)

    mutating func appendInterpolation(...)
}
```

These `appendInterpolation` methods can have any signature, they can accept any number of arguments, labeled or not, they can even `throw` and use generics, but they shouldn't return any value, or at least should be annotated with `@discardableResult` (on practice this is not enforced if there is any other `appendInterpolation` method that satisfies requirements) and they don't support trailing closures. There must be at least one `appendInterpolation` method &nbsp;satisfying these requirements.

```swift
func appendInterpolation(_ literal: String) { ... }

func appendInterpolation(
    number: NSNumber, 
    formatter: NSNumberFormatter
) { ... }

func appendInterpolation<T: Encodable>(
    js: T, 
    encoder: JSONEncoder = JSONEncoder()
) throws { ... }
```    

At compile time interpolation will be restricted to these methods only, which allows to restrict types of values that can be interpolated instead of allowing any types of values as in the current design.

We now also have a much better compiler support that will fail to compile if you use wrong types or wrong parameter names, though code completion does not quite work yet.

```swift
"\(js: [String: String](), encoder: JSONEncoder())" ✅

"\(js: [String: Any](), encoder: JSONEncoder())" 🛑

"\(js: [String: String](), encode: JSONEncoder())" 🛑
```

The code generated by the compiler changed a bit as well, so instead of code like this:

```swift
String(stringInterpolation:
    String(stringInterpolationSegment: "hello "),
    String(stringInterpolationSegment: name),
    String(stringInterpolationSegment: "!")
)
```

it will generate something that looks more like this<sup><a>[2:4]</a></sup>:

```swift
String(stringInterpolation: {
    var temp = String.StringInterpolation(literalCapacity: 7, interpolationCount: 1)
    temp.appendLiteral("hello ")
    temp.appendInterpolation(name)
    temp.appendLiteral("!")
    return temp
}())
```

If we go through the process step by step again then we see that first the insteance of the associated interpolation type will be created, then the first literal segment will be appended to it, then the first interpolated value with the `name` value will be appended, then the last literal segment will be appened and finally the value of interpolation type will be passed into the constructor.

Lets see now how our implementation will change with Swift 5.

### Demo 2 ([playground](https://github.com/ilyapuchka/SwiftStringInterpolation))

So with this new design we can simplify things we could do before, for example boolean expressions: [^4]

```swift
// old
"Cheese Sandwich \(isStarred ? "(*)" : "")"

// new
"Cheese Sandwich \(if: isStarred, "(*)")"
```

Or can even create our own DSLs, like for string formatting[^2][^5]:

```swift
"The price is $\(cost, format: "%.2f")"

"\(42, radix: .binary)"
```

or attributed strings[^6]:

```swift
"Hello, \("iOS Astronauts", .color(.red))"
```

or such special cases as GitHub Msarkdown: [^7]

```swift
"See \(issue: 123)"
```

We can even go a bit further and implemt our own template DSL: [^8]

```swift
let hello: Template = """
    \(if: greeting, 
        then: "Hello", 
        else: "Goodbye"
    ) \(for: names, do: { name, loop in 
        "\(loop.index + 1). \(name)"
    })
    """
```

Or a more type-safe version of string format: [^8]

```swift
let hello: StringFormatter<(String, Date)> = "Hello, \(.string). Today is \(.date)."

render(hello, "iOS Astronauts", Date()) ✅
render(hello, Date(), "iOS Astronauts") 🛑
```

Some of these things will surely make it into the standard library and many 3rd party implementations will popup on GitHub and I hope now you are excited as me about this small but great Swift feature and new opportunities it offers.

### One more thing

There is also one small but very useful improvement in Swift 5 not directly related to string interpolation, but one that makes it even easier to use. Now you can use `#` to tell Swift that quotes and back slashes in your string are actually literals. With that when you want to use string interpolation you need to add the same number of `#` . With this you no longer need to use `\` to escape characters, which is a big deal when dealing for example with regular expressions [^9]

```swift
// old
print("<a href=\"\(url)\" title=\"Apple Developer\">")

// new
print(#"<a href="\#(url)" title="Apple Developer">"#)
```


[^1]: [https://swiftdoc.org/v3.0/protocol/expressiblebystringinterpolation/](https://swiftdoc.org/v3.0/protocol/expressiblebystringinterpolation/)
[^2]: [https://github.com/apple/swift-evolution/blob/master/proposals/0228-fix-expressiblebystringinterpolation.md](https://github.com/apple/swift-evolution/blob/master/proposals/0228-fix-expressiblebystringinterpolation.md) 
[^3]: [https://gist.github.com/brentdax/79fa038c0af0cafb52dd](https://gist.github.com/brentdax/79fa038c0af0cafb52dd)
[^4]: [https://ericasadun.com/2018/12/12/the-beauty-of-swift-5-string-interpolation/](https://ericasadun.com/2018/12/12/the-beauty-of-swift-5-string-interpolation/)
[^5]: [https://ericasadun.com/2018/12/14/more-fun-with-swift-5-string-interpolation-radix-formatting/](https://ericasadun.com/2018/12/14/more-fun-with-swift-5-string-interpolation-radix-formatting/) 
[^6]: [http://alisoftware.github.io/swift/2018/12/16/swift5-stringinterpolation-part2/](http://alisoftware.github.io/swift/2018/12/16/swift5-stringinterpolation-part2/) 
[^7]: [http://alisoftware.github.io/swift/2018/12/15/swift5-stringinterpolation-part1/](http://alisoftware.github.io/swift/2018/12/15/swift5-stringinterpolation-part1/) 
[^8]: [https://github.com/ilyapuchka/Interplate](https://github.com/ilyapuchka/Interplate) 
[^9]: [https://github.com/apple/swift-evolution/blob/master/proposals/0200-raw-string-escaping.md](https://github.com/apple/swift-evolution/blob/master/proposals/0200-raw-string-escaping.md)


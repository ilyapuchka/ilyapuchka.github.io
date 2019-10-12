---
id: 5b6f5a3a9d28c70f0f015f72
title: ~= vs Range.contains(_:)
date: 2016-04-14T22:50:00.000Z
description: "Today I was working on simple validators that we use for forms (backed by awesome Eureka) and had to implement validator that validates string length. So I did it like this..."
tags: Swift
---

Today I was working on simple validators that we use for forms (backed by awesome [Eureka](https://github.com/xmartlabs/Eureka)) and had to implement validator that validates string length. So I did it like this:

```swift
struct StringValidator: Validator {
    typealias ValueType = String
    
    let stringRange: Range<Int>
    init(stringRange: Range<Int> = 1..<Int.max) {
        self.stringRange = stringRange
    }
    
    func validate(value: String?) -> Bool {
        guard let value = value?.stringByTrimmingCharactersInSet(.whitespaceAndNewlineCharacterSet()) else {
            return true
        }
        return stringRange.contains(value.characters.count)
    }
}
```

The idea is simple. Form field can have a validator with default range (`1..<Int.max`) that will validate any not empty string, but it can also setup validator with specific range that will define minimum and maximum string length. Using `isEmpty` on string is not an option because it makes a special case and for that I will need to define a separate validator like `NonEmptyStringValidator` what looks unnecessary.

Then I wrote some tests. And noticed that when I pass an empty string as a value and expect that it will fail validation test never completes. First I thought that there is some issues when I combine several validators together. But the reason is much simpler. `Range` is a `SequenceType`. And `SequenceType` provides default implementation for `contains(_:)` method that simply iterates through all sequence members. Probably `Range` does not override it so it is iterated from 1 to `Int.max` and each index is compared with 0. For me it looks strange because I don't see any problem with providing specific implementation of that method that will only check bounds. It will not break the contract of `SequenceType`. It does not look like `Range` can contain indexes in random order or can be discontinuous. But for whatever reason we don't have it in stdlib.

I definitely didn't want to compare range `startIndex` and `endIndex` manually. So my first attempt to fix this was moving to `NSRange`:

```swift
return NSLocationInRange(value.characters.count, NSRange(stringRange))
```

It works and only checks for range bounds. But that does not look nice either.

After some time I found much better solution (I think it dawned on me at the moment when I switched to Safari tab with ["Match me if you can"](https://appventure.me/2015/08/20/swift-pattern-matching-in-detail/) article):

```swift
return stringRange ~= value.characters.count
```

Works perfectly and looks much better than any other solution. Though I had to put a comment describing what it does because `~=` is so rarely used by itself.

> Also I found out that there are `HalfOpenInterval` and `ClosedInterval` that are returned from `...` or `..<` operators for `Comparable` generic argument. But for `ForwardIndexType` (which `Int` is) these operators return `Range`. Intervals are not collections or sequences and don't have aforementioned issue.

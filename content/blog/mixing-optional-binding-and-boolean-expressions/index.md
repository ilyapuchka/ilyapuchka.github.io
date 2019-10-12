---
id: 5b6f5a3a9d28c70f0f015f73
title: Mixing optional binding and boolean expressions
date: 2016-04-28T21:11:07.000Z
description: "There were few times already when I used this little-known feature of Swift in real code and it improved (in my opinion) readability a lot and much better described the intention of the code."
tags: Swift
---

There were few times already when I used this little-known feature of Swift in real code and it improved (in my opinion) readability a lot and much better described the intention of the code.

Here is the original code from the real app:

```swift
if let cutoffDate = menu?.cutoffDate where menu?.mealSwapEnabledForProduct == true {
  ...
} else {
  ...
}
```

Very trivial piece of code. But it contains one problem - it communicate wrong intention. When optional binding comes first and is followed by `where` it may seem that we make decision based on the value in this optional and the boolean expression is secondary. But in fact decision here should be made based on the boolean expression.

We can make it much better because we don't have to have `where` always at the end of `if` statement:

```swift
if menu?.mealSwapEnabledForProduct == true,
  let cutoffDate = menu?.cutoffDate {
  ...
} else {
  ...
}
```

I think this way the code communicates our logic and intention much better.

In Swift we can combine optional binding with `where` and boolean expressions. But after we started optional binding block we can have only `where` at the end of it, or another optional binding block with its own `where`. So boolean expression can not appear after optional binding.

Here is the full [grammar](https://developer.apple.com/library/ios/documentation/Swift/Conceptual/Swift_Programming_Language/Statements.html#//apple_ref/swift/grammar/optional-binding-head) of `if` statement:

    if-statement → if­ condition-clause ­code-block­ else-clause(opt­)
    else-clause → else­ code-block­ else­ if-statement­
    
    condition-clause → expression­
    condition-clause → expression­,­ condition-list­
    condition-clause → condition-list­
    condition-clause → availability-condition­, ­expression­
    condition-list → condition­ | condition­,­ condition-list­
    condition → availability-condition­ | case-condition­ | optional-binding-condition­
    case-condition → case ­pattern­ initializer­ where-clause(­opt)­
    optional-binding-condition → optional-binding-head­ optional-binding-continuation-list­(opt) ­where-clause­opt­
    optional-binding-head → let­ pattern­ initializer­ | var ­pattern initializer­
    optional-binding-continuation-list → optional-binding-continuation­ | optional-binding-continuation­, ­optional-binding-continuation-list­
    optional-binding-continuation → pattern ­initializer­ | optional-binding-head­

So this grammar says that condition can start with expression (boolean) or availability condition, followed by condition list, which can contain another availability condition or `case` condition or optional binding. And as you can see condition list can contain several other condition lists.

For example this is a valid `if` statement:

```swift
if
  #available(watchOS 2, *), 
  booleanExpr1 && booleanExpr2, 
  #available(iOS 9, *), 
  let value11 = value1 where value11 > 0,
  case let .Some(value1) = value1 where value1 > 0,
  #available(OSX 10, *), 
  case let .Some(value2) = value2 where value2 < 0,
  let value22 = value2 where value22 < 0 {
```
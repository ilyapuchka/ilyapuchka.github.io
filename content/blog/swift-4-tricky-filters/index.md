---
id: 5b6f5a3a9d28c70f0f015f85
title: Swift 4 tricky filters
date: 2017-09-26T07:46:10.000Z
description: ""
tags: ""
---

This is a short story of a regression in Swift 4 that I've recently had to deal with. It can seem as a simple problem, but I think it's a good example of unexpected regression caused by a positive change in a language standard library.

<!-- description -->

First - a bit of a context. In my current project we extensively use [Eureka](http://github.com/xmartlabs/Eureka) framework to build forms. Most of the time values in our forms are selected from a list of options. For this purpose Eureka has a special type of section - `SelectableSectionType`. There is also a base class `Section` that represents a collection of rows. To make working with rows and sections easier this type implements protocols that allow us to work with it as with a collection of rows, like if it was a plain array. One of these protocols is `RangeReplaceableCollection` which simplifies inserting and removing rows from the section. I would not describe here all the machinery behind it but I will show some parts of this implementation to showcase the issue.

Any `Section` that implements `SelectableSectionType` handles rows selection that can be setup with multiple or single selection option. In case of a single selection implementation goes through all the rows of this section and clears the value of the row that was selected previously, which removes selection indicator from its cell, and sets the value of the row for the new selection (selected row is determined by non-nil value). For that it is using combination of `filter` and `forEach` methods:

```swift
extension SelectableSectionType where Self: Section {

    func prepare(selectableRows rows: [BaseRow]) {
        for row in rows {
            ...
            row.onCellSelection { [weak self] cell, row in
                guard let s = self, !row.isDisabled else { return }
                switch s.selectionType {
                case .multipleSelection: ...
                case let .singleSelection(enableDeselection):
                    // clear baseValue for all rows except selected
                    s.filter { $0.baseValue != nil && $0 != row }.forEach {
                        $0.baseValue = nil
                        $0.updateCell()
                    }
                    // update value of selected row
                }
            }
        }
    }
}
```

This code works fine with Swift 3, but with Swift 4 selection started to behave "weird": as soon as you select new option it was not possible to select previous option any more.

Debugging this issue lead to discovery that after option was deselected and then selected again `row.onCellSelection` closure was still called, as expected, but `guard` expression was not passing any more, specifically because `self` was `nil`. As in this context `self` is a reference to `Section` it would mean that the section was at some point deallocated. `row.section` which should contain a reference to the section where row was added to, was also `nil` at this point. But as other rows were behaving correctly it could only mean that they were referencing different sections, and one of them was at some point deallocated.

And indeed adding `deinit` method to `Section` and adding a breakpoint there clearly demonstrated that some instance of section was being deallocated. What was still surprising is that `deinit` was called even before `row.onCellSelection` closure completed. Instead it was called right after `forEach` returned.

[My first guess](https://twitter.com/ilyapuchka/status/910155957480624128) was to blame some bug related to ARC, but it turned out to be related to [SE-0174](https://github.com/apple/swift-evolution/blob/master/proposals/0174-filter-range-replaceable.md). According to this proposal a new version of `filter` method was added to `RangeReplaceableCollection` which is returning `Self` instead of `[Self.Element]` as defined in Swift 3. This method has a default implementation:

```swift
extension RangeReplaceableCollection {

    public func filter(
        _ isIncluded: (Element) throws -> Bool
    ) rethrows -> Self {
        return try Self(self.lazy.filter(isIncluded))
    }

}

extension RangeReplaceableCollection {

    public init<S : Sequence>(_ elements: S)
        where S.Element == Element {
        self.init()
        append(contentsOf: elements)
    }

}
```

`RangeReplaceableCollection` already requires `init` initialiser on implementing type which made this implementation possible.

And indeed `init` and `append` methods of `Section` were called in this case. As you can see it was resulting in updating `row.section` property. At the same time using KVO it was calling `prepare(selectableRows:)` when row was added to the section, which resulted in overriding `onCellSelection` for this row.

```swift
extension Section: RangeReplaceableCollection {
    public func append<S: Sequence>(contentsOf newElements: S) where S.Iterator.Element == BaseRow {
        kvoWrapper.rows.addObjects(from: newElements.map { $0 }) // triggers KVO invocation
        ...
        for row in newElements {
            row.wasAddedTo(section: self)
        }
    }
}

extension BaseRow {
    final func wasAddedTo(section: Section) {
        self.section = section
        ...
    }
}
```

And as the section reference in row is `weak` and a new section was just created by `filter` method, this instance was deallocated as soon as code was escaping the only context that has a strong reference to it, which is a subsequent `forEach` call.

The fix for this issue is much simpler then debugging it. One of the option is to stop using `filter`:

```swift
s.forEach {
    guard $0.baseValue != nil && $0 != row else { return }
    $0.baseValue = nil
    $0.updateCell()
}
```

Another option is to explicitly specify return type of `filter` method so that Swift 3 variant is used:

```swift
s.filter { $0.baseValue != nil && $0 != row } as [BaseRow]
```

Both of these options will result in array of rows being created instead of new `Section` which will not lead to all of its side effects, in this case unneeded. Luckily none of the rest of Eureka's code was affected as in other places where `filter` was used its return type was already explicitly set to array.

This was a tricky issue and a fun hunt! I hope this write-up will help me and you to avoid such bugs in future. And as always thanks to [Joe Groff](https://twitter.com/jckarter) for being so helpful and responsive on Twitter.

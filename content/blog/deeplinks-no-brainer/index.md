---
id: 5b6f5a3a9d28c70f0f015f84
title: Deep links with no brainer
date: 2017-09-06T20:16:00.000Z
description: "Very often in my practice deep links were something that no one cares much, they work somehow and its fine. Or there are just few of them and its really not hard to maintain. But working for a long time on one product that targets several very different markets reveals all the importance of deep links in a long run. There are always requests from marketing teams to support new kind of deep link for a new marketing campaign, to open some new screen in the app from push notification, or with some specific parameters, when existing deep link can't be reused for what ever reason and you have to create yet another one for the same action. In the modern app there are also all kinds of different sources of urls that should act like a deep link to your app - universal links, push notifications, shortcut items etc."
tags: iOS, Swift, Architecture
---

Very often in my practice deep links were something that no one cares much, they work somehow and its fine. Or there are just few of them and its really not hard to maintain. But working for a long time on one product that targets several very different markets reveals all the importance of deep links in a long run. There are always requests from marketing teams to support new kind of deep link for a new marketing campaign, to open some new screen in the app from push notification, or with some specific parameters, when existing deep link can't be reused for what ever reason and you have to create yet another one for the same action. In the modern app there are also all kinds of different sources of urls that should act like a deep link to your app - universal links, push notifications, shortcut items etc.

<!-- description -->

Unless your app's navigation is architectured entirely around URLs, when you basically get deep links handling for free, it can very fast become a nightmare to maintain. Bad deep links implementations can suffer from different severe issues, sometimes few of them at the same time:

- it is usually heavily stringly typed
- warm and cold state handling is fragile and unpredictable, sometimes everything works, sometime - fails miserably
- its hard to debug, requires to step through each line of code
- impossible to see what deep links are handled on the screen just by glancing at code
- no tracking, no error reporting, no logging
- no tests
- something breaks almost with each release and is discovered much later

In this post I'll describe an approach for deep links handling that I've just recently came up with trying to address all aforementioned issues. The main design goals of this approach are:

- reliability, deep links should not break, or at least should break less
- readability, it should be clear how deep links are handeled
- testability, it should be easier to unit test deep links
- tracking, it should be easier to track deep link handling, both during debuggin and in production

Probably most obvious solution would be just to present final screens modally from what ever place in the app, or to push it on top of the current navigation stack. If that would be the case there wouldn't be this post in the first place. You still would need to handle different states of view hierarchy but things will become much easier comparing to the case when opening deep link should involve navigation to intermediate screens, like if user would navigate to them themselves. So keep in mind that it's the case.

Solution involves several action points. First, deep links should be described in a type safe manner, avoiding stringly typing as much as possible. This can be achieved by using enums or structs. Next, state of deep link handling should be stored in memory and this information should be descriptive. Again enums come for the rescue. It should be possible to track this state for error and successful scenarious. Deep links routes registration should be clear from side effects, like opening modal screens or switching tabs, to make it easier to unit test. Finally handling deep links from a cold and warm start should be done in a predictable way by always starting it from a single point and then sinking deep link through the application's screens graph.

### Strongly typed deep links

Each deep link is represented with an url and an _intent_ that is modelled by enum with associated values. You should aim to have as little deep links variations as possible and having too many cases in the enum will help you to assert that. This intent cases describe actions which should be performed as a result of deep link handling, usually opening some screen in the app.

```swift
struct DeepLink {
    let url: URL
    let intent: Intent
    
    enum Intent {
        case showRecipe(recipeId: String)
        case editMenu(subscriptionId: String, weekOrMenuId: Either<Int, String>)
        case showSubscription(subscriptionId: String, week: Int)
        ...
    }
    
}

add(routes: [
    "subscription/:subscriptionId/swap/:menuId",
    "subscription/:subscriptionId/:weekId/edit"
    ]) { params -> DeepLink.Intent? in
        ...
}
```

Alternatively deep link can be described with a protocol and multiple structs (or classes if you want) implementing this protocol. When handeled, instead of switching over intent we will switch over type of deep link, which is basically the same.

```swift
protocol DeepLink {
    var url: URL { get }
    static var routes: [String] { get }
    static var authorized: Bool { get }
    
    init?(url: URL, dictionary: [String: String])
}

struct MealSwapDeepLink: DeepLink {

    static let routes: [String] = [
        "subscription/:subscriptionId/swap/:menuId",
        "subscription/:subscriptionId/:weekId/edit"
    ]
    
    static let requiresAuthorization = true

    let url: URL
    let subscriptionId: String
    let menuOrWeekId: Either<Int, String>
    
    init?(url: URL, dictionary: [String: String]) {
        ...
    }
    
}
```    

Using protocol approach can give more flexibility (Swift enums are relatively rigid and limited), isolate unrelated deep links from each other in separate files, what can be considered as a drawback though. But it also comes with drawbacks like possible types explosion and more boilerplate to write.  
Enum approach on the other hand looks cleaner and requires less boilerplate. Also if you already use libraries like [JLRoutes](https://github.com/joeldev/JLRoutes) it will require less changes to the code structure.  
They both suffer from violation of Open-Closed Principle, but it feels like trying to solve this will unnecessary complicate the implementation.

The rest of code examples will be based on enums approach.

### State of deep link handling

Deep link handling state can be also represented as enum. Having a custom type for that will give you more control over it.

```swift
enum DeepLinkHandling: CustomStringConvertible {

    // deeplink successfully handled
    case opened(DeepLink)

    // deeplink was rejected because it can't be handeled, with optional log message
    case rejected(DeepLink, String?)

    // deeplink handling delayed because more data is needed
    case delayed(DeepLink, Bool)

    // deeplink was passed through to some other handler
    case passedThrough(to: DeepLinkHandler, DeepLink)
    
    var description: String {
        switch self {
        case .opened(let deeplink):
            return "Opened deeplink \(deeplink)"
        case .rejected(let deeplink, let reason):
            return "Rejected deeplink \(deeplink) for reason : \(reason ?? "unknown")"
        case .delayed(let deeplink, _):
            return "Delayed deeplink \(deeplink)"
        case .passedThrough(let handler, let deeplink):
            return "Passed through deeplink \(deeplink) to \(type(of: handler))"
        }
    }
}
```

With such type you can describe each state of deep link handling that you can be interested in (you might need some more cases depending on the architecture of your app, but you got the idea), and will be able to associate with it any information usefull for tracking or logging.

### Deep link handler

`DeepLinkHandler` protocol describes set of requirements for view controller (typically) to implement in order to take part in deep link handling process. It requires just one stored property and one method to implement.

```swift
protocol DeepLinkHandler: class {
    // stores the current state of deeplink handling
    var deeplinkHandling: DeepLinkHandling? { get set }
    // attempts to handle deeplink and returns next state
    func open(deeplink: DeepLink, animated: Bool) -> DeepLinkHandling
}
```

When implementing this protocol you will only care about these requirements, logic to handle state changes will be implemented in a default implementations in extension of this protocol. `open(deeplink:animated:)` method also is not intended to be called manually from your code - again it will be called from default implementation of the protocol.

```swift
extension DeepLinkHandler {
    
    // Attempts to handle deeplink and updates its state, 
    // should be always called instead of method that returns state
    func open(deeplink: DeepLink, animated: Bool) {
        let result = open(deeplink: deeplink, animated: animated)
        log.debug(result)
        // you can track rejected or opened deeplinks here too
        deeplinkHandling = result
        
        if case let .passedThrough(handler, deeplink) = result {
            handler.open(deeplink: deeplink, animated: animated) as Void
        }
    }
    
    // Call to complete deeplink handling if it was delayed
    func complete(deeplinkHandling: DeepLinkHandling?) {
        if case let .delayed(deeplink, animated)? = deeplinkHandling {
            open(deeplink: deeplink, animated: animated) as Void
            if case .delayed? = self.deeplinkHandling { return }
        }
    }
}
```

Simplest implementation of this protocol will just return `opened` or `rejected` states.

```swift
extension RecipeFlowController: DeepLinkHandler {

    func open(deeplink: DeepLink, animated: Bool) -> DeepLinkHandling {
        switch deeplink {
        case .showRecipe(let recipeId):
            showRecipe(withId: recipeId)
            return .opened(deeplink)
        default:
            // none of other deeplinks can be handled by this controller
            // we can also do assertionFailure here
            // because it's most likely programmer's error:
            // either deeplink handling is missing
            // or wrong screen was asked to handle deeplink
            return .rejected(deeplink, nil)
        }
    }

}
```

More complicated implementation with delayed handling and several screens involved in deep link handling:

```swift
extension MyMenuNavigationController: DeepLinkHandler {

    func open(deeplink: DeepLink, animated: Bool) -> DeepLinkHandling {
        // if view is not loaded yet we should probably wait for it
        guard isViewLoaded else { .delayed(deeplink, animated) }
            
        switch deeplink.intent {
        case 
            .editMenu(let subscriptionId, _),
            .showSubscriptions(let subscriptionId):

            guard subscriptions != nil else {
                // wait until subscriptions are loaded somewhere else or trigger loading here
                return .delayed(deeplink, animated)
            }

            if let subscription = subscriptionWithId(subscriptionId) {
                return showSubscription(subscriptionId, toOpen: deeplink, animated: animated)
            } else {
                // we can return specific error to improve logging and tracking of errors
                return .rejected(deeplink, .noSuchSubscription(subscriptionId))
            }
        default:
            return .rejected(deeplink, nil)
        }
    }
    
    func viewDidLoad() {
        super.viewDidLoad()
        ...
        complete(deeplinkHandling: deepLinkHandling)
    }
    
    func showSubscription(subscriptionId: String, toOpen deeplink: DeepLink, animated: Bool) -> DeepLinkHandling {
        let subscriptionViewController = showSubscription(subscriptionId, animated: animated)
        // pass deeplink further to next screen
        return .passedThrough(to: subscriptionViewController, deeplink)
    }
    
    func loadData() {
        dataProvider.loadSubscriptions() { [weak self] subscriptions, error in
            // at some point when we want to retry any delayed deeplink
            self?.complete(deeplinkHandling: self!.deeplinkHandling)
        }
    }

}

extension SubscriptionViewController: DeepLinkHandler {
    
    func open(deeplink: DeepLink, animated: Bool) -> DeepLinkHandling {
        switch deeplink.intent {
        case .showSubscription(_, let week):
            // navigate to requested view and do nothing
            return switchToWeekOrMenuId(.init(week), toOpen: deeplink, animated: animated, completion: {
                .opened(deeplink)
            })
        case .editMenu(_, let weekOrMenuId):
            // go to requested week and proceed to meal swap
            return switchToWeekOrMenuId(weekOrMenuId, toOpen: deeplink, animated: animated, completion: { [weak self] in
                if self?.canEditMenu == true {
                    self?.showEditMenu(toOpen: deeplink, animated: animated)
                    return .opened(deeplink)
                } else {
                    return .rejected(deeplink, .cantEditMenu)
                }
            })
        default:
            return .rejected(deeplink, nil)
        }
    }
    
    func switchToWeekOrMenuId(_ weekOrMenuId: Either<Int, String>, toOpen deeplink: DeepLink, animated: Bool, completion: () -> DeepLinkHandling) -> DeepLinkHandling {
        switch weekOrMenuId {
        case .left(let week):
            if self.week != week {
                switchToWeek(week)
                return .delayed(deeplink, animated)
            } else {
                return completion()
            }
        case .right(let: menuId):
            if menu.id != menuId {
                getMenuWeekByMenuId(menuId) { [weak self] week in
                    self?.switchToWeek(week)
                    //or we can transform link to one with week and try to open it
                }
                return .delayed(deeplink, animated)
            } else {
                return completion()
            }
        }
    }
    
    func switchedToWeek(_ week: Int) {
        // called somewhere later when we navigated to requested week
        complete(deeplinkHandling: deeplinkHandling)
    }
    
}
```

With this implementation it is more clear what deep links are handled on the screen, because they will be clearly stated in `switch`, and even how the state transitioning happens. Descriptive names for these states and additional console logs also improve debugging experience. Assertions that might be used here will help to catch bugs faster during development.

### Deep links registration

Deep link routes registration should be clear of side effects (calling deep link handler to handle matched deep link) which can be performed implicitly by router (object that is responsible for keeping track of registered deep links routes and match them with incoming deep links, invoking registered handler closure as a side effect, consider mentioned JLRoutes as example). It makes testing deep links parsing much simpler.

```swift
class HFRoutes: JLRoutes {

    override init() {
        add(route: "recipe/:recipeId") { params in
            return .recipe(params["recipeId"] as! String)
        }

        addAuthorized(routes: [
                "subscription/:subscriptionId/swap/:menuId",
                "subscription/:subscriptionId/:weekId/edit"
            ]) { params in

            guard let subscriptionId = params["subscriptionId"] as? String else { return nil }

            if let menuId = params["menuId"] as? String {
                return .editMenu(subscriptionId, .init(menuId))
            } else if let weekId = params["weekId"] as? String, let week = Int(string: weekId) {
                return .editMenu(subscriptionId, .init(week))
            } else {
                return nil
            }
        }
    }

}
```

This can be also done in a more type safe manner without using strings for parameters names. This will help to avoid typos when defining pattern and parsing its parameters.

```swift
enum DeepLinkPathComponent: String {
    case recipeId
    case subscriptionId
    case menuId
    case weekId
}

// some custom operators to build url patterns using strings and components
// private to not pollute the scope of the rest of the app

private func /(lhs: String, rhs: String) -> String {
    return "\(lhs)/\(rhs)"
}

private func /(lhs: String, rhs: DeepLinkPathComponent) -> String {
    return "\(lhs)/:\(rhs.rawValue)"
}

private func /(lhs: DeepLinkPathComponent, rhs: String) -> String {
    return ":\(lhs.rawValue)/\(rhs)"
}

extension HFRoutes {
    
    private func parse(params: [String: Any]) -> [DeepLinkPathComponent: String] {
        var _params: [DeepLinkPathComponent: String] = [:]
        for (key, value) in params {
            guard let component = DeepLinkPathComponent(rawValue: key) else { continue }
            _params[component] = String(describing: value)
        }
        return _params
    }
    
    func add(routes: [String], handler: ([DeepLinkPathComponent: String]) -> DeepLink.Intent?) {
        add(routes: routes) { params in 
            return handler(parse(params: params)) != nil
        }
    }

}

add(route: "recipes" / .recipeId) { params in 
    if let recipeId = params[.recipeId] {
        return .recipe(recipeId)
    } else {
        return nil
    }
}

addAuthorized(routes: [
    "subscription" / .subscriptionId / "swap" / .menuId,
    "subscription" / .subscriptionId / .weekId / "edit"
]) { params in
    
    if let subscriptionId = params[.subscriptionId], let menuId = params[.menuId] {
        return .editMenu(subscriptionId: subscriptionId, menuIdOrWeekId: .init(menuId))
    }
    if let subscriptionId = params[.subscriptionId], let weekId = params[.weekId], let week = Int(string: weekId) {
        return .editMenu(subscriptionId: subscriptionId, menuIdOrWeekId: .init(week))
    }
    return nil
}
```

String path components can also be extracted to the enum but this will not give as much as in case of parameters which are most likely used repeatedly across different patterns.

### Cold and warm start

To make deep link handling predictable no matter in what state the app is, handling deep link should always start from the same point - root handler. This root handler can be an app delegate (and mock in unit tests). To always start deep link handling with app delegate it should be stored as a week reference in a router:

```swift
class HFRoutes {

    weak private(set) var rootDeepLinkHandler: DeepLinkHandler?
    
    init(rootDeepLinkHandler: DeepLinkHandler?) {
        self.rootDeepLinkHandler = rootDeepLinkHandler
        super.init()
        registerRoutes()
    }

    func add(routes: [String], handler: ([DeepLinkPathComponent: String]) -> DeepLink.Intent?) {
        add(routes: routes) { params in 
            guard let intent = handler(parse(params: params)) else { return false }
            let url = URL(string: params[kJLRouteURLKey] as! String)!
            let deeplink = DeepLink(url: url, intent: intent)
            rootDeeplinkHandler?.open(deeplink: deeplink, animated: true) as Void?
            return true
        }
    }
    
}
```

In case of cold start it's usual that the app needs to perform some launch routine, i.e. restore previously stored user session. During this routine you can present some `LaunchViewController` as a root view controller of the key window. In this case app delegate can handle deep links itself, delaying all of them until launch routine is finished. When launch is done app delegate completes its deep link handling and passes it through to newly installed root view controller (`HomeViewController`).

```swift
extension AppDelegate: DeepLinkHandler {

    lazy private(set) var router: HFRoutes! = HFRoutes(rootDeepLinkHandler: self)

    func open(deeplink: DeepLink, animated: Bool) -> DeepLinkHandling {
        switch deeplink.intent {
        case .registerForPushNotifications:
            // deeplinks which do not require any UI changes
            // can be handled by app delegate itself
            registerForPushNotifications()
        default:
            // all other deeplinks handling involves UI changes
            if let deeplinkHandler = keyWindow?.rootViewController as? DeepLinkHandler {
                return .passedThrough(to: deeplinkHandler, deeplink, animated))
            } else {
                return .delayed(deeplink, animated)
            }
        }
    }
    
    // can be called from LaunchViewController via delegate or trigerred with a notification
    func applicationDidFinishLaunchingRoutine(...) {
        ...
        self.complete(deeplinkHandling: deeplinkHandling)
    }

}
```

In case of "warm" start `HomeViewController` will be already a root view controller, so app delegate will delegate deep link handling to it right away. `HomeViewController` can i.e. switch to correct tab and will pass deep link further.

```swift
extension HomeViewController: DeepLinkHandler {

    func open(deeplink: DeepLink, animated: Bool) -> DeepLinkHandling? {
        switch deeplink.intent {
        case .showRecipe:
            return selectTab(.explore, toOpen: deeplink, animated: animated)
        case .editMenu, .showSubscription:
            return selectTab(.mymenu, toOpen: deeplink, animated: animated)
        }
    }
    
    func selectTab(_ tab: HomeTab, toOpen deeplink: DeepLink, animated: Bool) -> DeepLinkHandling {
        selectTab(tab, animated: animated)
        guard let deeplinkHandler = selectedViewController as? DeepLinkHandler else { return .rejected(deeplink, nil) }
        return .passedThrough(to: deeplinkHandler, deeplink, animated)
    }
}
```

This way the flow of deep link handling will be always predictable and application state (cold or warm start) related logic will be concentrated in one place in the app delegate.

### Next steps

We can make one step further in the direction of removing side effects from the methods that handles deep links. By adding additional associated value of closure type to some `DeppLinkHandling` cases we can postpone a bit execution of the side effect required to handle a deep link and make `open(deeplink:animated) -> DeepLinkHandling` even more free of side effects. Side effect will be performed by default implementation of `open(deeplink:animated)` method. In unit tests we don't care about this method, unless we want to validate side effect itself, and to test logic in `open(deeplink:animated) -> DeepLinkHandling` becomes even simpler.

```swift
enum DeepLinkHandling {
    case opened(DeepLink, ((Bool) -> Void)?)
    case rejected(DeepLink, Error?)
    case delayed(DeepLink, Bool, ((Bool) -> Void)?)
    case passedThrough(DeepLink, ((Bool) -> DeepLinkHandler)?)
}

extension DeepLinkHandler {

    func open(deeplink: DeepLink, animated: Bool) {
        let result = open(deeplink: deeplink, animated: animated)
        log.debug(result)
        // you can track rejected or opened deeplinks here too
        deeplinkHandling = result
        
        switch result {
        case let .opened(_, sideEffect?):
            sideEffect(animated)
        case let .delayed(_, _, sideEffect?):
            sideEffect(animated)
        case let .passedThrough(deeplink, sideEffect?):
            if let handler = sideEffect(animated) {
                handler.open(deeplink: deeplink, animated: animated) as Void
            }
        default: break
        }
    }

}
```

### Bonus

Additionaly you can use Sourcery to code generate all the boilerplate. It can be also used to generate README file with supported links or html page to use for manual testing.

```swift
enum Intent {
    // sourcery: deeplink_route = recipe/:recipeId
    // sourcery: deeplink_route = account/recipe/:recipeId
    case showRecipe(recipeId: String)
    
    // sourcery: deeplink_route = subscription/:subscriptionId/swap/:menuId
    // sourcery: deeplink_authorized
    case editMenu(subscriptionId: String, menuId: String)
    
    // sourcery: deeplink_route = subscription/:subscriptionId/:week/edit
    // sourcery: deeplink_authorized
    case editMenuForWeek(subscriptionId: String, week: Int)
}

// auto-generated code

add(routes: [
    "recipe/:recipeId",
    "account/recipe/:recipeId"
    ]) { params in
    guard let recipeId = params["recipeId"] as? String else { return nil }
    return .showRecipe(recipeId: recipeId)
}

addAuthorized(routes: [
    "subscription/:subscriptionId/swap/:menuId"
]) { params in 
    guard let subscroptionId = params["subscriptionId"] as? String else { return nil }
    guard let menuId = params["menuId"] as? String else { return nil }
    return .editMenu(subscritionId: subscriptionId, menuId: menuId)
}

addAuthorized(routes: [
    "subscription/:subscriptionId/:week/edit"
]) { params in 
    guard let subscriptionId = params["subscriptionId"] as? String else { return nil }
    guard let week = (params["week"] as? String).map(Int.init(string:)) else { return nil }
    return . editMenuForWeek(subscritionId: subscriptionId, week: week)
}
```

### Conclusion

With all this deep links code should become no brainer. It can be also a first step for implementing navigation in your app entirely based on the URLs, where `open(deeplink:animated)` method will become the main entry point of each controller. This will not only give you deep links support out of the box, but will also force you to isolate controllers from each other, minimising data flow between them.

Tell me what you think in the comments!

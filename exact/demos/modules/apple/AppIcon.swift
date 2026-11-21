// `icon-grid`: one page of the home's icons as ONE native view.
//
// The home's icons were each six Exact nodes (a column, a button, a view, a picture, a text, badges) and a page of 24
// cost 28 ms of main-thread apply on the simulator, in the first frame for page 1 and again for each page the staging
// mounted after it (2-4 missed frames each, 2-3x that on a phone). A page is now one node: this view lays its icons
// out, draws them from StillArt's cache (the picture, the label, the badge), takes the press and the long-press menu,
// and hands each icon's square to the launch (`LaunchIcons`) as the hatch did. Page 1 builds its 24 icons inside the
// first commit (~0.15 ms each); the other pages are empty until `IconBuilder` fills them in slices of a few ms, never
// while the pager is being touched unless the page is the one coming on screen.
//
// The same one-"|"-list props as `search-reveal`: `slugs` `demo-names` `captions` `arts` `inspirations` (all the demos),
// `grid-page` `grid-per` (this page's range: [page * per, (page + 1) * per)), `grid-cols`, `cell-width`, `art-size`,
// `badge-approved` `badge-changed` (the slugs, "|"-joined), `scroller` (the pager's `data-scroller` name).
// Events: `change(slug)` an icon was tapped; `message("share:<slug>")`, `message("inspiration:<url>")`,
// `message("code:<slug>")` a long-press menu row was chosen.
#if os(iOS)
import CoreText
import UIKit
import UIKit.UIGestureRecognizerSubclass

// MARK: - one icon

/// The squircle the demo opens out of and closes into; its own a11y element, as the button was.
final class IconSquare: UIImageView {
    var activate: (() -> Void)?
    override func accessibilityActivate() -> Bool { activate?(); return activate != nil }
}

private func snap(_ v: CGFloat) -> CGFloat { (v * 3).rounded() / 3 }
private func snapUp(_ v: CGFloat) -> CGFloat { (v * 3).rounded(.up) / 3 }
private func snapDown(_ v: CGFloat) -> CGFloat { (v * 3).rounded(.down) / 3 }

/// An icon's cell: the square, its label under it and a badge on its top-right corner.
final class AppIconView: UIView {
    let square = IconSquare()
    let label = UILabel()
    private(set) var slug = ""
    private(set) var name = ""
    private(set) var inspiration = ""
    private var badge: UIView?
    private var badgeKind = ""

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        square.isUserInteractionEnabled = false
        square.contentMode = .scaleAspectFill
        // Sized down from 192 px to the icon's own pixels: mipmapped, not aliased on a 2x screen.
        square.layer.minificationFilter = .trilinear
        square.isAccessibilityElement = true
        square.accessibilityTraits = .button
        addSubview(square)
        label.font = .systemFont(ofSize: 11, weight: .semibold)
        label.textColor = UIColor(white: 1, alpha: 0.92)
        label.textAlignment = .center
        label.lineBreakMode = .byTruncatingTail
        addSubview(label)
    }
    required init?(coder: NSCoder) { fatalError() }

    func set(slug: String, name: String, caption: String, art: String, inspiration: String, cell: CGFloat, size: CGFloat) {
        self.slug = slug
        self.name = name
        self.inspiration = inspiration
        // Whole device pixels, as the plan's boxes are placed: a square on a fractional pixel is resampled.
        let box = CGRect(x: snap(frame.minX + (cell - size) / 2) - frame.minX, y: 0, width: size, height: size)
        // The square is the picture's own shape (alpha baked, tools/gen-icons.ts): no clip; the radius is the lift's outline.
        square.frame = box
        square.image = art.isEmpty ? nil : StillArt.image(art)
        square.accessibilityLabel = "Open \(name)"
        square.accessibilityIdentifier = "icon-\(slug)"
        label.text = caption
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: label.text ?? "", attributes: [.font: label.font!]))
        let text = min(cell, CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)))
        label.textAlignment = .left
        label.frame = CGRect(x: snap(frame.minX + (cell - text) / 2) - frame.minX, y: size + 6 - 1.0 / 3, width: text, height: ceil(label.font.lineHeight))
    }

    func setBadge(_ kind: String, cell: CGFloat, size: CGFloat) {
        guard kind != badgeKind else { return }
        badgeKind = kind
        badge?.removeFromSuperview()
        badge = nil
        guard kind == "changed" || kind == "approved" else { return }
        let disc = UIView(frame: CGRect(x: snapDown(frame.minX + (cell + size) / 2 - 14) - frame.minX, y: -6, width: 20, height: 20))
        disc.isUserInteractionEnabled = false
        disc.layer.cornerRadius = 10
        disc.layer.borderWidth = 1.5
        disc.layer.borderColor = UIColor.white.cgColor
        disc.backgroundColor = kind == "changed" ? UIColor(red: 1, green: 0.624, blue: 0.039, alpha: 1) : UIColor(red: 0.204, green: 0.78, blue: 0.349, alpha: 1)
        disc.isAccessibilityElement = true
        disc.accessibilityLabel = kind == "changed" ? "Changed" : "Approved"
        disc.accessibilityIdentifier = "\(kind)-\(slug)"
        if kind == "approved" {
            // The check: a 6 x 11 box's right and bottom borders (2 pt, white), turned 45 degrees and lifted 2 pt.
            let check = CAShapeLayer()
            let path = UIBezierPath()
            path.move(to: CGPoint(x: 1, y: -5.5)); path.addLine(to: CGPoint(x: 3, y: -5.5)); path.addLine(to: CGPoint(x: 3, y: 5.5))
            path.addLine(to: CGPoint(x: -3, y: 5.5)); path.addLine(to: CGPoint(x: -3, y: 3.5)); path.addLine(to: CGPoint(x: 1, y: 3.5))
            path.close()
            check.path = path.cgPath
            check.fillColor = UIColor.white.cgColor
            check.position = CGPoint(x: 10, y: 10)
            check.setAffineTransform(CGAffineTransform(translationX: 0, y: -2).rotated(by: .pi / 4))
            disc.layer.addSublayer(check)
        }
        addSubview(disc)
        badge = disc
    }
}

// MARK: - the lists the props carry

/// A "|"-joined list, split once however many pages read it.
private enum PropLists {
    nonisolated(unsafe) private static var cache: [String: [String]] = [:]
    static func split(_ text: String?) -> [String] {
        guard let text, !text.isEmpty else { return [] }
        if let hit = cache[text] { return hit }
        let parts = text.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
        if cache.count > 24 { cache = [:] }
        cache[text] = parts
        return parts
    }
}

// MARK: - the page

final class AppIconGridView: UIView, UIContextMenuInteractionDelegate, UIGestureRecognizerDelegate {
    struct Spec {
        var slugs: [String] = [], names: [String] = [], captions: [String] = [], arts: [String] = [], inspirations: [String] = []
        var from = 0, to = 0, cols = 4
        var cell: CGFloat = 0, size: CGFloat = 0
        var approved = Set<String>(), changed = Set<String>()
        var scroller = ""
        var page = 0
    }
    private(set) var spec = Spec()
    private(set) var icons: [AppIconView] = []
    var onOpen: ((String) -> Void)?
    var onMenu: ((String) -> Void)?
    private var menuShown = false
    private let tap = IconGesture()
    /// The pages' builder asks: how many of this page's icons are on the view.
    var pending: Int { max(0, spec.to - spec.from - icons.count) }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = nil
        tap.delegate = self
        tap.grid = self
        tap.addTarget(self, action: #selector(tapped))
        addGestureRecognizer(tap)
        addInteraction(UIContextMenuInteraction(delegate: self))
    }
    required init?(coder: NSCoder) { fatalError() }

    // MARK: props

    func configure(_ props: [String: String]) {
        func number(_ key: String, _ fallback: Double = 0) -> Double { Double(props[key] ?? "") ?? fallback }
        var next = Spec()
        next.slugs = PropLists.split(props["slugs"])
        next.names = PropLists.split(props["demo-names"])
        next.captions = PropLists.split(props["captions"])
        next.arts = PropLists.split(props["arts"])
        next.inspirations = PropLists.split(props["inspirations"])
        next.page = Int(number("grid-page"))
        let per = max(0, Int(number("grid-per")))
        next.from = min(next.slugs.count, next.page * per)
        next.to = min(next.slugs.count, (next.page + 1) * per)
        next.cols = max(1, Int(number("grid-cols", 4)))
        next.cell = CGFloat(number("cell-width"))
        next.size = CGFloat(number("art-size"))
        next.approved = Set(PropLists.split(props["badge-approved"]))
        next.changed = Set(PropLists.split(props["badge-changed"]))
        next.scroller = props["scroller"] ?? ""
        let sameIcons = next.slugs[next.from..<next.to] == spec.slugs[min(spec.from, spec.slugs.count)..<min(spec.to, spec.slugs.count)]
            && next.cell == spec.cell && next.size == spec.size && next.cols == spec.cols
        let first = icons.isEmpty && spec.slugs.isEmpty
        spec = next
        if !sameIcons {
            // The page's icons or their geometry changed (a new screen size): start over.
            for icon in icons { LaunchIcons.shared.remove(view: icon.square); icon.removeFromSuperview() }
            icons = []
        }
        if next.page == 0 || (!first && !icons.isEmpty) {
            // Page 1 is in the first commit; a page that already has icons keeps them current.
            build(upTo: next.to - next.from)
        }
        refreshBadges()
        IconBuilder.shared.add(self)
    }

    private func refreshBadges() {
        for icon in icons {
            let kind = spec.changed.contains(icon.slug) ? "changed" : spec.approved.contains(icon.slug) ? "approved" : ""
            icon.setBadge(kind, cell: spec.cell, size: spec.size)
        }
    }

    /// Makes icons up to `count` of this page's; false when there is nothing left to make.
    @discardableResult
    func build(upTo count: Int) -> Bool {
        let total = spec.to - spec.from
        guard icons.count < min(count, total) else { return icons.count < total }
        let rowPitch = spec.size + 26 + 22
        while icons.count < min(count, total) {
            let i = icons.count, at = spec.from + i
            let icon = AppIconView(frame: CGRect(x: CGFloat(i % spec.cols) * spec.cell, y: CGFloat(i / spec.cols) * rowPitch, width: spec.cell, height: spec.size + 26))
            icon.set(slug: spec.slugs[at], name: at < spec.names.count ? spec.names[at] : "", caption: at < spec.captions.count ? spec.captions[at] : "",
                     art: at < spec.arts.count ? spec.arts[at] : "", inspiration: at < spec.inspirations.count ? spec.inspirations[at] : "",
                     cell: spec.cell, size: spec.size)
            let kind = spec.changed.contains(icon.slug) ? "changed" : spec.approved.contains(icon.slug) ? "approved" : ""
            icon.setBadge(kind, cell: spec.cell, size: spec.size)
            icon.square.activate = { [weak self, weak icon] in if let icon { self?.open(icon) } }
            addSubview(icon)
            icons.append(icon)
            LaunchIcons.shared.set(slug: icon.slug, view: icon.square)
        }
        accessibilityElements = icons.flatMap { icon in icon.subviews }
        return icons.count < total
    }

    func destroy() {
        for icon in icons { LaunchIcons.shared.remove(view: icon.square) }
        IconBuilder.shared.remove(self)
    }

    // MARK: touches

    func icon(at point: CGPoint) -> AppIconView? {
        icons.first { !$0.square.isHidden && $0.square.frame.offsetBy(dx: $0.frame.minX, dy: $0.frame.minY).contains(point) }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        icon(at: point) != nil ? self : nil
    }

    func press(_ icon: AppIconView, down: Bool) { icon.square.alpha = down ? 0.85 : 1 }

    private func open(_ icon: AppIconView) { onOpen?(icon.slug) }

    @objc private func tapped() {
        guard let icon = tap.tappedIcon, !menuShown else { return }
        open(icon)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    // MARK: the long-press menu

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        guard let icon = icon(at: location) else { return nil }
        let slug = icon.slug, name = icon.name, inspiration = icon.inspiration
        return UIContextMenuConfiguration(identifier: slug as NSString, previewProvider: nil) { [weak self] _ in
            var rows: [UIMenuElement] = []
            if !inspiration.isEmpty {
                rows.append(UIAction(title: "Inspiration", image: UIImage(systemName: "sparkles")) { _ in self?.onMenu?("inspiration:\(inspiration)") })
            }
            rows.append(UIAction(title: "Share", image: UIImage(systemName: "square.and.arrow.up")) { _ in self?.onMenu?("share:\(slug)") })
            rows.append(UIAction(title: "View Code", image: UIImage(systemName: "doc.text")) { _ in self?.onMenu?("code:\(slug)") })
            return UIMenu(title: name, children: rows)
        }
    }

    /// UIKit lifts the squircle alone, clipped to its outline, over the route's view (not the pager, which would cut it).
    private func lifted(_ configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
        guard let slug = configuration.identifier as? String, let icon = icons.first(where: { $0.slug == slug }), !icon.square.isHidden,
              icon.square.window != nil, let parent = icon.square.superview else { return nil }
        let square = icon.square
        let container = sequence(first: parent, next: { $0.superview }).first(where: { $0.next is UIViewController }) ?? parent
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: square.bounds, cornerRadius: square.bounds.width * 0.2237)
        let target = UIPreviewTarget(container: container, center: square.convert(CGPoint(x: square.bounds.midX, y: square.bounds.midY), to: container))
        return UITargetedPreview(view: square, parameters: parameters, target: target)
    }
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, highlightPreviewForItemWithIdentifier identifier: NSCopying) -> UITargetedPreview? {
        lifted(configuration)
    }
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configuration: UIContextMenuConfiguration, dismissalPreviewForItemWithIdentifier identifier: NSCopying) -> UITargetedPreview? {
        lifted(configuration)
    }
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willDisplayMenuFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        menuShown = true
        tap.cancel()
    }
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        // The finger that opened the menu lifts after this: it is not a tap.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.menuShown = false }
    }
}

/// A finger on an icon: names the launch on touch-down, dims the square, and is a tap when it lifts on the icon without
/// having moved (a drag is the pager's) or held (a hold is the menu's).
private final class IconGesture: UIGestureRecognizer {
    weak var grid: AppIconGridView?
    private var icon: AppIconView?
    private var start = CGPoint.zero
    private var began = 0.0
    private(set) var tappedIcon: AppIconView?

    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }
    convenience init() { self.init(target: nil, action: nil) }

    /// Fails the gesture where it stands (the menu took the finger).
    func cancel() { isEnabled = false; isEnabled = true }

    private func release() {
        if let icon { grid?.press(icon, down: false) }
        icon = nil
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let touch = touches.first, touches.count == 1, numberOfTouches == 1, let grid, let hit = grid.icon(at: touch.location(in: grid)) else {
            state = .failed
            return
        }
        icon = hit
        start = touch.location(in: grid)
        began = touch.timestamp
        grid.press(hit, down: true)
        LaunchIcons.shared.touch(hit.square)
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let touch = touches.first, let grid, icon != nil else { return }
        let p = touch.location(in: grid)
        if hypot(p.x - start.x, p.y - start.y) > 10 { release(); state = .failed }
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let touch = touches.first, let hit = icon, state == .possible else { release(); state = .failed; return }
        let held = touch.timestamp - began
        release()
        if held < 0.45 { tappedIcon = hit; state = .ended } else { state = .failed }
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        release()
        state = .failed
    }
    override func reset() { release() }
    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}

// MARK: - the staging

/// Fills the pages after the first: a few ms of icons per turn, the page nearest the pager's offset first, and none while
/// a finger is on the pager unless the page is already coming on screen.
final class IconBuilder {
    static let shared = IconBuilder()
    private struct Weak { weak var grid: AppIconGridView? }
    private var grids: [Weak] = []
    private var scheduled = false
    private var watching: UIScrollView?
    private var observation: NSKeyValueObservation?
    private let slice = 0.003

    func add(_ grid: AppIconGridView) {
        grids.removeAll { $0.grid == nil }
        if !grids.contains(where: { $0.grid === grid }) { grids.append(Weak(grid: grid)) }
        if grid.pending > 0 { schedule(after: 0.03) }
    }
    func remove(_ grid: AppIconGridView) { grids.removeAll { $0.grid == nil || $0.grid === grid } }

    private func schedule(after delay: Double) {
        guard !scheduled else { return }
        scheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.run() }
    }

    private func scroller() -> UIScrollView? {
        guard let name = grids.compactMap({ $0.grid?.spec.scroller }).first(where: { !$0.isEmpty }) else { return nil }
        return PageScrollers.shared.scrollView(name)
    }

    /// A page is on screen, or about to be (half a page of margin).
    private func near(_ grid: AppIconGridView, in scroll: UIScrollView) -> Bool {
        guard grid.window != nil else { return false }
        let frame = grid.convert(grid.bounds, to: scroll)
        return frame.intersects(scroll.bounds.insetBy(dx: -scroll.bounds.width * 0.5, dy: 0))
    }
    private func visible(_ grid: AppIconGridView, in scroll: UIScrollView) -> Bool {
        guard grid.window != nil else { return false }
        return grid.convert(grid.bounds, to: scroll).intersects(scroll.bounds)
    }

    private func watch(_ scroll: UIScrollView) {
        guard watching !== scroll else { return }
        watching = scroll
        // A page that scrolls into view before its turn is made at once, in the frame that shows it.
        observation = scroll.observe(\.contentOffset, options: []) { [weak self] scroll, _ in
            guard let self else { return }
            for entry in self.grids {
                if let grid = entry.grid, grid.pending > 0, self.visible(grid, in: scroll) { grid.build(upTo: .max) }
            }
        }
    }

    private func run() {
        scheduled = false
        grids.removeAll { $0.grid == nil }
        let waiting = grids.compactMap { $0.grid }.filter { $0.pending > 0 }
        guard !waiting.isEmpty else { observation = nil; watching = nil; return }
        let scroll = scroller()
        if let scroll { watch(scroll) }
        let busy = scroll.map { $0.isTracking || $0.isDragging || $0.isDecelerating } ?? false
        var order = waiting
        if let scroll {
            let mid = scroll.bounds.midX
            order.sort { abs($0.convert($0.bounds, to: scroll).midX - mid) < abs($1.convert($1.bounds, to: scroll).midX - mid) }
        } else {
            order.sort { $0.spec.page < $1.spec.page }
        }
        let started = CACurrentMediaTime()
        for grid in order {
            if busy, let scroll, !near(grid, in: scroll) { continue }
            while grid.pending > 0 {
                grid.build(upTo: grid.icons.count + 1)
                if CACurrentMediaTime() - started > slice { break }
            }
            if CACurrentMediaTime() - started > slice { break }
        }
        if waiting.contains(where: { $0.pending > 0 }) { schedule(after: busy ? 0.05 : 0.012) }
    }
}

// MARK: - the tag

final class AppIconGrid: ExactNativeInstance {
    private let grid = AppIconGridView()

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        grid.onOpen = { slug in events.change(slug) }
        grid.onMenu = { text in events.message(text) }
        try? setProps(props)
    }

    override var view: ExactNativeView { grid }

    override func setProps(_ props: [String: String]) throws {
        grid.configure(props)
    }

    override func destroy() { grid.destroy() }
}
#endif

// `page-dots`: the home's page indicator, driven by the pager's scroll offset directly.
//
// The pager is a node marked `hatch="page-scroller"` (springboard.contract): its UIScrollView is
// handed to `pageScrollerHatch` below, which names it. A `page-dots` tag with the same
// `scroller` observes that scroll view's `contentOffset` (KVO: called on the main thread inside
// each offset change, so the dots move in the frame the page moves) and moves one pill layer;
// no plan, no Rust. The pill stretches between two dots as the page turns, as UIPageControl's
// does. A tap on the row scrolls to the nearest dot's page.
//
// Props:
//   scroller      the pager's `data-scroller` name
//   count         the number of pages
//   dot-color     the resting dots; default rgba(255, 255, 255, 0.35)
//   active-color  the current page's pill; default #ffffff
//   dot-size      default 7; dot-spacing: the gap between dots, default 7
#if os(iOS)
import UIKit

// MARK: - The pager's hatch

/// Built and changed: the pager's scroll view, under its `data-scroller` name.
func pageScrollerHatch(_ element: ExactElement) {
    guard let name = element.data[.scroller], let scroll = PageScrollers.scrollView(in: element) else { return }
    PageScrollers.shared.set(name, scroll)
}

/// The node is leaving, its view still there.
func pageScrollerHatchEnded(_ element: ExactElement) {
    guard let name = element.data[.scroller] else { return }
    PageScrollers.shared.remove(name, element: element)
}

final class PageScrollers {
    static let shared = PageScrollers()
    private final class Weak<T: AnyObject> { weak var value: T?; init(_ v: T) { value = v } }
    private var scrollers: [String: Weak<UIScrollView>] = [:]
    private var waiting: [Weak<PageDotsView>] = []

    /// The scroll view of a hatched scroller: its platform object, or the one in its view.
    static func scrollView(in element: ExactElement) -> UIScrollView? {
        if let scroll = element.platform as? UIScrollView { return scroll }
        guard let view = element.view else { return nil }
        if let scroll = view as? UIScrollView { return scroll }
        var queue: [UIView] = view.subviews
        while !queue.isEmpty {
            let next = queue.removeFirst()
            if let scroll = next as? UIScrollView { return scroll }
            queue.append(contentsOf: next.subviews)
        }
        return nil
    }

    func scrollView(_ name: String) -> UIScrollView? { scrollers[name]?.value }

    func set(_ name: String, _ scroll: UIScrollView) {
        guard scrollers[name]?.value !== scroll else { return }
        scrollers[name] = Weak(scroll)
        waiting.removeAll { $0.value == nil }
        for dots in waiting.compactMap(\.value) where dots.scrollerName == name { dots.attach(scroll) }
    }

    func remove(_ name: String, element: ExactElement) {
        guard let current = scrollers[name]?.value, current === Self.scrollView(in: element) else { return }
        scrollers[name] = nil
        for dots in waiting.compactMap(\.value) where dots.scrollerName == name { dots.attach(nil) }
    }

    func wait(_ dots: PageDotsView) {
        if !waiting.contains(where: { $0.value === dots }) { waiting.append(Weak(dots)) }
    }
}

// MARK: - The view

final class PageDotsView: UIView {
    struct Style: Equatable {
        var scroller = ""
        var count = 0
        var dot = UIColor(white: 1, alpha: 0.35)
        var active = UIColor.white
        var size: CGFloat = 7
        var spacing: CGFloat = 7
    }

    private(set) var scrollerName = ""
    private var style = Style()
    private var dots: [CALayer] = []
    private let pill = CALayer()
    private weak var scroll: UIScrollView?
    private var observation: NSKeyValueObservation?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        layer.addSublayer(pill)
        pill.cornerCurve = .continuous
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped(_:))))
        isAccessibilityElement = false
    }

    required init?(coder: NSCoder) { nil }

    func configure(_ next: Style) {
        guard next != style else { return }
        let rebuild = next.count != style.count || next.dot != style.dot || next.active != style.active
            || next.size != style.size || next.spacing != style.spacing
        style = next
        scrollerName = next.scroller
        PageScrollers.shared.wait(self)
        if scroll == nil || PageScrollers.shared.scrollView(next.scroller) !== scroll {
            attach(PageScrollers.shared.scrollView(next.scroller))
        }
        if rebuild { rebuildDots() }
    }

    func attach(_ next: UIScrollView?) {
        guard next !== scroll else { return }
        observation = nil
        scroll = next
        guard let next else { return }
        // `contentOffset` is KVO-compliant and fires synchronously in each change, scroll or deceleration.
        observation = next.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in self?.follow() }
        follow()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        rebuildDots()
    }

    // MARK: layers

    private var x0: CGFloat {
        let n = CGFloat(style.count)
        return (bounds.width - (n * style.size + max(0, n - 1) * style.spacing)) / 2
    }
    private var y0: CGFloat { (bounds.height - style.size) / 2 }
    private var pitch: CGFloat { style.size + style.spacing }

    /// The resting dots, built once per prop change or size: the scroll moves only the pill.
    private func rebuildDots() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        while dots.count > style.count { dots.removeLast().removeFromSuperlayer() }
        while dots.count < style.count {
            let dot = CALayer()
            dot.cornerCurve = .continuous
            layer.insertSublayer(dot, below: pill)
            dots.append(dot)
        }
        for (i, dot) in dots.enumerated() {
            dot.frame = CGRect(x: x0 + CGFloat(i) * pitch, y: y0, width: style.size, height: style.size)
            dot.cornerRadius = style.size / 2
            dot.backgroundColor = style.dot.cgColor
        }
        pill.cornerRadius = style.size / 2
        pill.backgroundColor = style.active.cgColor
        pill.isHidden = style.count < 2
        CATransaction.commit()
        follow()
    }

    /// The pill for a fractional page: it reaches for the next dot with its front edge first, then its back edge follows.
    private func follow() {
        guard style.count > 1 else { return }
        let width = scroll?.bounds.width ?? 0
        let page = width > 0 ? min(max((scroll?.contentOffset.x ?? 0) / width, 0), CGFloat(style.count - 1)) : 0
        let i = min(floor(page), CGFloat(style.count - 2))
        let f = page - i
        let left = x0 + i * pitch + max(0, 2 * f - 1) * pitch
        let right = x0 + i * pitch + style.size + min(1, 2 * f) * pitch
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        pill.frame = CGRect(x: left, y: y0, width: right - left, height: style.size)
        CATransaction.commit()
    }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        guard let scroll, style.count > 1, scroll.bounds.width > 0 else { return }
        let index = min(max(Int(((tap.location(in: self).x - x0 + style.spacing / 2) / pitch).rounded(.down)), 0), style.count - 1)
        scroll.setContentOffset(CGPoint(x: CGFloat(index) * scroll.bounds.width, y: scroll.contentOffset.y), animated: true)
    }
}

final class PageDots: ExactNativeInstance {
    private let dots = PageDotsView()

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { dots }

    override func setProps(_ props: [String: String]) throws {
        func number(_ key: String, _ fallback: CGFloat) -> CGFloat {
            guard let text = props[key], let value = Double(text), value.isFinite else { return fallback }
            return CGFloat(value)
        }
        func color(_ key: String, _ fallback: UIColor) -> UIColor {
            guard let c = glassPaneColor(props[key]) else { return fallback }
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        }
        var style = PageDotsView.Style()
        style.scroller = props["scroller"] ?? ""
        style.count = max(0, Int(number("count", 0)))
        style.dot = color("dot-color", style.dot)
        style.active = color("active-color", style.active)
        style.size = max(1, number("dot-size", 7))
        style.spacing = max(0, number("dot-spacing", 7))
        dots.configure(style)
    }
}
#endif

/**
 * Keeps React working on a page something else has edited. Browser page
 * translation (Chrome's Translate) and some extensions replace a text node
 * with an element of their own, so the node React remembers is no longer in
 * the page. When React then removes that node, or inserts another before it,
 * the DOM throws NotFoundError and the error boundary replaces the whole app.
 *
 * With this, a node to remove is taken out of wherever it now is (nothing
 * when it is nowhere), and an insert before a node that is not there adds the
 * new node at the end of its parent.
 * The translated text can be stale or out of order until the next reload,
 * which is better than losing the editor.
 */
export function tolerateForeignDomEdits(proto: Node = Node.prototype): void {
  const removeChild = proto.removeChild;
  const insertBefore = proto.insertBefore;

  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    // Wherever it was moved to, React wants it gone; a replaced text node has no parent.
    const parent = child.parentNode;
    if (parent !== this) return (parent ? removeChild.call(parent, child) : child) as T;
    return removeChild.call(this, child) as T;
  };

  proto.insertBefore = function <T extends Node>(this: Node, node: T, before: Node | null): T {
    if (before && before.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, before) as T;
  };
}

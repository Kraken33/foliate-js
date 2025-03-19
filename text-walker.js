const walkRange = (range, walker) => {
    const nodes = []
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
        const compare = range.comparePoint(node, 0)
        if (compare === 0) nodes.push(node)
        else if (compare > 0) break
    }
    return nodes
}

const walkDocument = (_, walker) => {
    const nodes = []
    for (let node = walker.nextNode(); node; node = walker.nextNode())
        nodes.push(node)
    return nodes
}

const filter = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    | NodeFilter.SHOW_CDATA_SECTION

const acceptNode = node => {
    if (node.nodeType === 1) {
        const name = node.tagName.toLowerCase()
        if (name === 'script' || name === 'style') return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_SKIP
    }
    return NodeFilter.FILTER_ACCEPT
}

const getWordAtPoint = (node, offset) => {
    if (node.nodeType !== Node.TEXT_NODE) return null
    
    const text = node.nodeValue
    if (!text?.trim()) return null // Skip empty text nodes

    // Find word boundaries
    let start = offset
    let end = offset

    // Quick check if we're on a word character
    if (/\w/.test(text[offset])) {
        // Already on a word, expand to boundaries
        while (start > 0 && /\w/.test(text[start - 1])) start--
        while (end < text.length && /\w/.test(text[end])) end++
    } else {
        // Find nearest word within reasonable bounds (limit search to 10 chars)
        const searchLimit = 10
        let found = false

        // Look left
        for (let i = offset - 1; i >= Math.max(0, offset - searchLimit); i--) {
            if (/\w/.test(text[i])) {
                start = end = i
                found = true
                break
            }
        }

        // Look right if didn't find on left
        if (!found) {
            for (let i = offset + 1; i < Math.min(text.length, offset + searchLimit); i++) {
                if (/\w/.test(text[i])) {
                    start = end = i
                    found = true
                    break
                }
            }
        }

        // Expand word boundaries if found a word
        if (found) {
            while (start > 0 && /\w/.test(text[start - 1])) start--
            while (end < text.length && /\w/.test(text[end])) end++
        }
    }

    // If no word found, return null
    if (start === end) return null

    // Find sentence boundaries (limit search to 200 chars)
    const searchLimit = 200
    let sentenceStart = Math.max(0, start - searchLimit)
    let sentenceEnd = Math.min(text.length, end + searchLimit)

    // Look for sentence start
    for (let i = start - 1; i >= sentenceStart; i--) {
        if (/[.!?]\s+/.test(text.slice(i, i + 2))) {
            sentenceStart = i + 2
            break
        }
    }

    // Look for sentence end
    for (let i = end; i < sentenceEnd; i++) {
        if (/[.!?]/.test(text[i])) {
            sentenceEnd = i + 1
            break
        }
    }

    // Get context words
    const beforeText = text.slice(sentenceStart, start).trim()
    const afterText = text.slice(end, sentenceEnd).trim()
    
    // Split into words and limit
    const beforeWords = beforeText ? beforeText.split(/\s+/).slice(-5) : []
    const afterWords = afterText ? afterText.split(/\s+/).slice(0, 5) : []

    // Build context
    const context = [
        ...beforeWords,
        text.slice(start, end),
        ...afterWords
    ].join(' ')

    // Create span element for the clicked word
    const span = document.createElement('span')
    span.className = 'clicked'
    span.textContent = text.slice(start, end)

    // Split the text node and insert the span
    const beforeTxt = text.slice(0, start)
    const afterTxt = text.slice(end)
    
    const fragment = document.createDocumentFragment()
    if (beforeTxt) fragment.appendChild(document.createTextNode(beforeTxt))
    fragment.appendChild(span)
    if (afterTxt) fragment.appendChild(document.createTextNode(afterTxt))
    
    node.parentNode.replaceChild(fragment, node)

    return {
        word: text.slice(start, end),
        context: context.trim(),
        range: {
            node,
            startOffset: start,
            endOffset: end,
            contextStartOffset: sentenceStart,
            contextEndOffset: sentenceEnd
        },
        element: span
    }
}

export const textWalker = function* (x, func) {
    const root = x.commonAncestorContainer ?? x.body ?? x
    const walker = document.createTreeWalker(root, filter, { acceptNode })
    const walk = x.commonAncestorContainer ? walkRange : walkDocument
    const nodes = walk(x, walker)
    const strs = nodes.map(node => node.nodeValue)
    const makeRange = (startIndex, startOffset, endIndex, endOffset) => {
        const range = document.createRange()
        range.setStart(nodes[startIndex], startOffset)
        range.setEnd(nodes[endIndex], endOffset)
        return range
    }
    for (const match of func(strs, makeRange)) yield match
}

export { getWordAtPoint }

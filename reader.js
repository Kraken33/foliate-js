import './view.js'
import { createTOCView } from './ui/tree.js'
import { createMenu } from './ui/menu.js'
import { Overlayer } from './overlayer.js'

const getCSS = ({ spacing, justify, hyphenate, fontSize }) => `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
        color-scheme: light;
    }
    /* https://github.com/whatwg/html/issues/5426 */
    @media (prefers-color-scheme: dark) {
        a:link {
            color: lightblue;
        }
    }
    p, li, blockquote, dd {
        font-size: ${fontSize};
        line-height: ${spacing};
        text-align: ${justify ? 'justify' : 'start'};
        -webkit-hyphens: ${hyphenate ? 'auto' : 'manual'};
        hyphens: ${hyphenate ? 'auto' : 'manual'};
        -webkit-hyphenate-limit-before: 3;
        -webkit-hyphenate-limit-after: 2;
        -webkit-hyphenate-limit-lines: 2;
        hanging-punctuation: allow-end last;
        widows: 2;
    }
    /* prevent the above from overriding the align attribute */
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }

    pre {
        white-space: pre-wrap !important;
    }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
        display: none;
    }
`

const locales = 'en'
const percentFormat = new Intl.NumberFormat(locales, { style: 'percent' })
const listFormat = new Intl.ListFormat(locales, { style: 'short', type: 'conjunction' })

const formatLanguageMap = x => {
    if (!x) return ''
    if (typeof x === 'string') return x
    const keys = Object.keys(x)
    return x[keys[0]]
}

const formatOneContributor = contributor => typeof contributor === 'string'
    ? contributor : formatLanguageMap(contributor?.name)

const formatContributor = contributor => Array.isArray(contributor)
    ? listFormat.format(contributor.map(formatOneContributor))
    : formatOneContributor(contributor)

function getAllElementsInRange(range) {
        const elements = [];
        const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE 
            ? range.startContainer 
            : range.startContainer.parentElement;
        const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE 
            ? range.endContainer 
            : range.endContainer.parentElement;

        // If start and end are the same element, return just that element
        if (startElement === endElement) {
            return [startElement];
        }

        // Get all elements between start and end
        let currentElement = startElement;
        while (currentElement && currentElement !== endElement) {
            elements.push(currentElement);
            currentElement = currentElement.nextElementSibling;
        }
        // Add the end element
        if (currentElement === endElement) {
            elements.push(endElement);
        }

        return elements;
    }

/**
 * Creates a regex pattern from a set of words
 * @param {Set<string>} wordSet - Set of words to match
 * @returns {RegExp} Regex pattern that matches any of the words
 */
function createWordMatchPattern(wordSet) {
    const pattern = Array.from(wordSet).join('|');
    return new RegExp(`\\b(${pattern})\\b`, 'gi');
}

/**
 * Finds all word matches in a text node
 * @param {Text} node - Text node to search
 * @param {RegExp} regex - Regex pattern to match
 * @param {Map} foundWords - Map to store word counts
 * @returns {Array} Array of match objects
 */
function findMatchesInTextNode(node, regex, foundWords) {
    const matches = [];
    const text = node.textContent;
    let match;
    
    // Reset regex for each text node
    regex.lastIndex = 0;
    
    while ((match = regex.exec(text)) !== null) {
        matches.push({
            node,
            word: match[0],
            startOffset: match.index,
            endOffset: match.index + match[0].length
        });
        
        // Update word count
        const currentCount = foundWords.get(match[0].toLowerCase()) || 0;
        foundWords.set(match[0].toLowerCase(), currentCount + 1);
    }
    
    return matches;
}

/**
 * Creates a highlighted span element for a word
 * @param {Text} node - Text node containing the word
 * @param {number} startOffset - Start position of the word
 * @param {number} endOffset - End position of the word
 */
function highlightWordInRange(node, startOffset, endOffset) {
    const range = document.createRange();
    range.setStart(node, startOffset);
    range.setEnd(node, endOffset);
    
    const span = document.createElement('span');
    span.style.backgroundColor = 'yellow';
    span.style.color = 'black';
    span.classList.add('highlight-word');
    range.surroundContents(span);
}

/**
 * Processes text nodes in an element to find and highlight words
 * @param {Element} element - Element to process
 * @param {RegExp} regex - Regex pattern to match
 * @param {Map} foundWords - Map to store word counts
 */
function processElement(element, regex, foundWords) {
    debugger;
    // Store matches to process later
    const matches = [];
    
    // Walk through text nodes
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    // Find all matches first
    let node;
    while (node = walker.nextNode()) {
        const nodeMatches = findMatchesInTextNode(node, regex, foundWords);
        matches.push(...nodeMatches);
    }
    
    // Apply highlights in reverse order to maintain correct positions
    matches.reverse().forEach(({ node, startOffset, endOffset }) => {
        highlightWordInRange(node, startOffset, endOffset);
    });
}

export class Reader {
    #tocView
    style = {
        spacing: 1.4,
        justify: true,
        hyphenate: true,
        fontSize: '100%',
    }
    annotations = new Map()
    annotationsByValue = new Map()
    highlightedWords = new Set()
    currentScreen = null
    bookContainer = null
    swipingEnabled = true
    constructor() {
        // select('#side-bar-button').addEventListener('click', () => {
        //     select('#dimming-overlay').classList.add('show')
        //     select('#side-bar').classList.add('show')
        // })
        // select('#dimming-overlay').addEventListener('click', () => this.closeSideBar())

        // const menu = createMenu([
        //     {
        //         name: 'layout',
        //         label: 'Layout',
        //         type: 'radio',
        //         items: [
        //             ['Paginated', 'paginated'],
        //             ['Scrolled', 'scrolled'],
        //         ],
        //         onclick: value => {
        //             this.view?.renderer.setAttribute('flow', value)
        //         },
        //     },
        // ])
        // menu.element.classList.add('menu')

        // select('#menu-button').append(menu.element)
        // select('#menu-button > button').addEventListener('click', () =>
        //     menu.element.classList.toggle('show'))
        // menu.groups.layout.select('paginated')
    }
    async open(file, target) {
        this.view = document.getElementById('foliate-view')
        await this.view.openAt(file, target)
        this.view.addEventListener('load', this.#onLoad.bind(this))
        this.view.addEventListener('relocate', this.#onRelocate.bind(this))

        const { book } = this.view
        this.view.renderer.setStyles?.(getCSS(this.style))
        this.view.renderer.next()

        // Set initial swipe state on renderer
        if (this.swipingEnabled) {
            this.view.renderer.setAttribute('swipe-enabled', '');
        }

        // select('#header-bar').style.visibility = 'visible'
        // select('#nav-bar').style.visibility = 'visible'
        // select('#left-button').addEventListener('click', () => this.view.goLeft())
        // select('#right-button').addEventListener('click', () => this.view.goRight())

        // const slider = select('#progress-slider')
        // slider.dir = book.dir
        // slider.addEventListener('input', e =>
        //     this.view.goToFraction(parseFloat(e.target.value)))
        // for (const fraction of this.view.getSectionFractions()) {
        //     const option = document.createElement('option')
        //     option.value = fraction
        //     select('#tick-marks').append(option)
        // }

        // document.addEventListener('keydown', this.#handleKeydown.bind(this))

        // const title = formatLanguageMap(book.metadata?.title) || 'Untitled Book'
        // document.title = title
        // select('#side-bar-title').innerText = title
        // select('#side-bar-author').innerText = formatContributor(book.metadata?.author)
        // Promise.resolve(book.getCover?.())?.then(blob =>
        //     blob ? select('#side-bar-cover').src = URL.createObjectURL(blob) : null)

        // const toc = book.toc
        // if (toc) {
        //     this.#tocView = createTOCView(toc, href => {
        //         this.view.goTo(href).catch(e => console.error(e))
        //         this.closeSideBar()
        //     })
        //     select('#toc-view').append(this.#tocView.element)
        // }

        // load and show highlights embedded in the file by Calibre
        // const bookmarks = await book.getCalibreBookmarks?.()
        // if (bookmarks) {
        //     const { fromCalibreHighlight } = await import('./epubcfi.js')
        //     for (const obj of bookmarks) {
        //         if (obj.type === 'highlight') {
        //             const value = fromCalibreHighlight(obj)
        //             const color = obj.style.which
        //             const note = obj.notes
        //             const annotation = { value, color, note }
        //             const list = this.annotations.get(obj.spine_index)
        //             if (list) list.push(annotation)
        //             else this.annotations.set(obj.spine_index, [annotation])
        //             this.annotationsByValue.set(value, annotation)
        //         }
        //     }
        //     this.view.addEventListener('create-overlay', e => {
        //         const { index } = e.detail
        //         const list = this.annotations.get(index)
        //         if (list) for (const annotation of list)
        //             this.view.addAnnotation(annotation)
        //     })
        //     this.view.addEventListener('draw-annotation', e => {
        //         const { draw, annotation } = e.detail
        //         const { color } = annotation
        //         draw(Overlayer.highlight, { color })
        //     })
        //     this.view.addEventListener('show-annotation', e => {
        //         const annotation = this.annotationsByValue.get(e.detail.value)
        //         if (annotation.note) alert(annotation.note)
        //     })
        // }
    }
    setStyles(styles) {
        this.style = { ...this.style, ...styles }
    }
    highlight(newWord) {
            const foundWords = new Map(); // word -> count
        const regex = createWordMatchPattern(newWord ? new Set([newWord]) : this.highlightedWords);
        
        processElement(this.bookContainer, regex, foundWords);
        console.log('Found words:', Object.fromEntries(foundWords));
    }
    setHighlightedWords(list) {
        this.highlightedWords = list
    }
    #handleKeydown(event) {
        const k = event.key
        if (k === 'ArrowLeft' || k === 'h') this.view.goLeft()
        else if(k === 'ArrowRight' || k === 'l') this.view.goRight()
    }
    #onLoad({ detail: { doc } }) {
        console.log('doc', doc)
        doc.addEventListener('keydown', this.#handleKeydown.bind(this))
    }
    #onRelocate({ detail }) {
        debugger;
        this.bookContainer = detail.range.commonAncestorContainer;
        const { fraction, location, tocItem, pageItem, range, doc } = detail

        console.log('detail', detail)

        // this.currentScreen = getAllElementsInRange(range);
        // this.highlightCurrentScreen();

        // const percent = percentFormat.format(fraction)
        // const loc = pageItem
        //     ? `Page ${pageItem.label}`
        //     : `Loc ${location.current}`
        // const slider = select('#progress-slider')
        // slider.style.visibility = 'visible'
        // slider.value = fraction
        // slider.title = `${percent} · ${loc}`
        if (tocItem?.href) this.#tocView?.setCurrentHref?.(tocItem.href)
    }
    unhighlight(word) {
        if (!this.bookContainer) return;
        
        // Find all highlighted spans
        const highlightedSpans = this.bookContainer.querySelectorAll('span.highlight-word');
        
        // Loop through spans and unhighlight those matching the word
        highlightedSpans.forEach(span => {
            if (span.textContent.toLowerCase() === word.toLowerCase()) {
                // Get the text content
                const text = span.textContent;
                
                // Create a text node to replace the span
                const textNode = document.createTextNode(text);
                
                // Replace the span with the text node
                span.parentNode.replaceChild(textNode, span);
            }
        });
        
        // Remove the word from highlighted words set
        this.highlightedWords.delete(word);
    }
    enableSwiping() {
        this.swipingEnabled = true;
        this.view?.renderer?.setAttribute('swipe-enabled', '');
    }
    disableSwiping() {
        this.swipingEnabled = false;
        this.view?.renderer?.removeAttribute('swipe-enabled');
    }
}

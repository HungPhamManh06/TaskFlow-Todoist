/* chat-markdown.js — Phase 11: Safe Markdown renderer for chat messages.
   -------------------------------------------------------------------
   Converts markdown text into safe DOM elements.
   NEVER uses innerHTML with raw model output.
   Allows: bold, italic, inline code, fenced code blocks, lists,
           headings, blockquotes, links.
   Blocks: <script>, <iframe>, event handlers, javascript: URLs.
   Security: all output goes through DOM API — no raw HTML parsing. */
'use strict';

var TaskFlowChatMarkdown = (function () {

  /* ---- Allowed elements whitelist ---- */
  var _SAFE_TAGS = new Set([
    'p', 'strong', 'em', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'h2', 'h3', 'h4',
    'a', 'br', 'hr', 'span',
  ]);

  /**
   * Create a safe DOM element with the given tag.
   * Falls back to <span> for unknown tags.
   */
  function _el(tag, attrs) {
    var t = _SAFE_TAGS.has(tag) ? tag : 'span';
    var el = document.createElement(t);
    if (attrs) {
      for (var k in attrs) {
        if (!attrs.hasOwnProperty(k)) continue;
        if (k === 'className') el.className = attrs[k];
        else if (k === 'href') {
          // Only safe URLs
          var url = attrs[k];
          if (url && typeof url === 'string' && !/^\s*javascript\s*:/i.test(url)) {
            el.setAttribute('href', url);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        } else if (k === 'start') {
          el.setAttribute('start', String(attrs.start));
        }
      }
    }
    return el;
  }

  /**
   * Parse inline markdown (bold, italic, code, links) into DOM fragments.
   */
  function _renderInline(text) {
    var frag = document.createDocumentFragment();
    // Process text segment by segment
    var remaining = text;
    while (remaining.length > 0) {
      // Fenced inline code first (highest priority)
      var codeMatch = /^`([^`]+)`/.exec(remaining);
      if (codeMatch) {
        var codeEl = _el('code');
        codeEl.textContent = codeMatch[1];
        frag.appendChild(codeEl);
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }
      // Bold: **text** or __text__
      var boldMatch = /^\*\*(.+?)\*\*|^__(.+?)__/.exec(remaining);
      if (boldMatch) {
        var strongEl = _el('strong');
        strongEl.textContent = boldMatch[1] || boldMatch[2];
        frag.appendChild(strongEl);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      // Italic: *text* or _text_ (but not inside words like file_name)
      var italicMatch = /^\*(.+?)\*|^_(.+?)_/.exec(remaining);
      if (italicMatch) {
        var emEl = _el('em');
        emEl.textContent = italicMatch[1] || italicMatch[2];
        frag.appendChild(emEl);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      // Link: [text](url)
      var linkMatch = /^\[([^\]]+)\]\(([^)]+)\)/.exec(remaining);
      if (linkMatch) {
        var aEl = _el('a', { href: linkMatch[2] });
        aEl.textContent = linkMatch[1];
        frag.appendChild(aEl);
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }
      // Line break
      var brMatch = /^  \n/.exec(remaining);
      if (brMatch) {
        frag.appendChild(_el('br'));
        remaining = remaining.slice(brMatch[0].length);
        continue;
      }
      // Plain text — consume until next special character
      var nextSpecial = remaining.search(/[*_`\[]|  \n/);
      if (nextSpecial === -1) {
        frag.appendChild(document.createTextNode(remaining));
        remaining = '';
      } else if (nextSpecial === 0) {
        // Special char not matched above — treat as literal
        frag.appendChild(document.createTextNode(remaining[0]));
        remaining = remaining.slice(1);
      } else {
        frag.appendChild(document.createTextNode(remaining.slice(0, nextSpecial)));
        remaining = remaining.slice(nextSpecial);
      }
    }
    return frag;
  }

  /**
   * Parse a markdown text block into a DOM element.
   * Input: raw markdown string
   * Output: a DOM element containing safe rendered content
   */
  function renderMarkdown(text) {
    if (!text || typeof text !== 'string') {
      return document.createTextNode('');
    }

    var container = _el('div');
    container.className = 'chat-md';

    var lines = text.split('\n');
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // Fenced code block: ```...```
      if (/^```/.test(line.trim())) {
        var lang = line.trim().replace(/^```/, '').trim();
        var codeLines = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```

        var pre = _el('pre');
        var code = _el('code');
        code.textContent = codeLines.join('\n');
        if (lang) code.className = 'language-' + lang;
        pre.appendChild(code);
        container.appendChild(pre);
        continue;
      }

      // Heading: ## text, ### text, #### text
      var headingMatch = /^(#{2,4})\s+(.+)$/.exec(line);
      if (headingMatch) {
        var level = headingMatch[1].length;
        var hTag = 'h' + Math.min(level, 4);
        var hEl = _el(hTag);
        hEl.appendChild(_renderInline(headingMatch[2]));
        container.appendChild(hEl);
        i++;
        continue;
      }

      // Blockquote: > text
      if (/^>\s?/.test(line)) {
        var bqLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          bqLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        var bq = _el('blockquote');
        bq.appendChild(_renderInline(bqLines.join('\n')));
        container.appendChild(bq);
        continue;
      }

      // Horizontal rule: --- or ***
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        container.appendChild(_el('hr'));
        i++;
        continue;
      }

      // Unordered list: - item or * item
      if (/^[\-\*]\s+/.test(line)) {
        var ul = _el('ul');
        while (i < lines.length && /^[\-\*]\s+/.test(lines[i])) {
          var li = _el('li');
          li.appendChild(_renderInline(lines[i].replace(/^[\-\*]\s+/, '')));
          ul.appendChild(li);
          i++;
        }
        container.appendChild(ul);
        continue;
      }

      // Ordered list: 1. item, 2. item
      if (/^\d+\.\s+/.test(line)) {
        var ol = _el('ol');
        var startNum = 1;
        var olMatch = /^(\d+)\.\s+/.exec(line);
        if (olMatch) startNum = parseInt(olMatch[1], 10) || 1;
        ol.setAttribute('start', startNum);
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          var oLi = _el('li');
          oLi.appendChild(_renderInline(lines[i].replace(/^\d+\.\s+/, '')));
          ol.appendChild(oLi);
          i++;
        }
        container.appendChild(ol);
        continue;
      }

      // Empty line: paragraph break
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Regular paragraph — collect consecutive non-empty lines
      var paraLines = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             !/^```/.test(lines[i].trim()) &&
             !/^(#{2,4})\s+/.test(lines[i]) &&
             !/^>\s?/.test(lines[i]) &&
             !/^[\-\*]\s+/.test(lines[i]) &&
             !/^\d+\.\s+/.test(lines[i]) &&
             !/^(-{3,}|\*{3,})$/.test(lines[i].trim())) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length > 0) {
        var pEl = _el('p');
        pEl.appendChild(_renderInline(paraLines.join('\n')));
        container.appendChild(pEl);
      }
    }

    return container;
  }

  /* ---- Public API ---- */
  return {
    renderMarkdown: renderMarkdown,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaskFlowChatMarkdown;
}

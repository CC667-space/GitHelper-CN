import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="min-w-0 break-words leading-6">
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <span
              className="cursor-help text-blue-700 underline decoration-dotted"
              title={href ? `外链未自动打开：${href}` : '外链未自动打开'}
            >
              {children}
            </span>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-4 border-slate-300 pl-3 text-slate-600">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const text = React.Children.toArray(children).join('');
            const isBlock = Boolean(className) || text.includes('\n');
            return (
              <code
                className={
                  isBlock
                    ? `${className ?? ''} block min-w-max bg-transparent p-0 font-mono text-xs text-inherit`
                    : 'rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800'
                }
              >
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-lg font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => <h3 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h3>,
          hr: () => <hr className="my-3 border-slate-200" />,
          img: ({ alt }) => (
            <span className="rounded bg-amber-50 px-1 text-amber-800">
              [远程图片已阻止{alt ? `：${alt}` : ''}]
            </span>
          ),
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          pre: ({ children }) => (
            <pre className="my-2 max-w-full overflow-x-auto rounded-md bg-slate-900 p-3 text-slate-100 [&>code]:block [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <table className="my-2 block w-full overflow-x-auto border-collapse text-xs">
              {children}
            </table>
          ),
          td: ({ children }) => (
            <td className="border border-slate-300 px-2 py-1 align-top">{children}</td>
          ),
          th: ({ children }) => (
            <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        }}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

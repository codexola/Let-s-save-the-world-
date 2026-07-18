import Link from "next/link";
import { ViewerAvatars } from "./ViewerAvatars";

type BlogPostCard = {
  id: string;
  title: string;
  coverImage: string;
  viewCount: number;
  author: { id: string; name: string; photoUrl?: string | null };
  views?: Array<{ viewer: { id: string; name: string; photoUrl?: string | null } }>;
};

export function BlogCard({ post }: { post: BlogPostCard }) {
  return (
    <article className="blog-card panel">
      <Link href={`/blog/${post.id}`} className="blog-card-link">
        <p className="blog-author">
          {post.author.photoUrl && (
            <img src={post.author.photoUrl} alt="" className="avatar-sm" />
          )}
          <span>{post.author.name}</span>
        </p>
        <div className="blog-cover-wrap">
          <img src={post.coverImage} alt="" className="blog-cover" />
        </div>
        <h3 className="blog-title">{post.title}</h3>
        <div className="blog-meta">
          <span className="muted">{post.viewCount.toLocaleString()} views</span>
          {post.views && post.views.length > 0 && <ViewerAvatars viewers={post.views} />}
        </div>
      </Link>
    </article>
  );
}

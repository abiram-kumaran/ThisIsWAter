
  function like(postId) {
    const likeButton = document.getElementById('like-button-' + postId);
    const likesCountElement = document.getElementById('likes-count-' + postId);
    
    fetch(`/like-post/${postId}`, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        // Update the like icon and count
        if (data.liked) {
          likeButton.classList.remove('far');
          likeButton.classList.add('fas');
        } else {
          likeButton.classList.remove('fas');
          likeButton.classList.add('far');
        }

        // Update likes count
        likesCountElement.textContent = data.likesCount;
      })
      .catch(error => {
        console.error('Error liking the post:', error);
      });
  }

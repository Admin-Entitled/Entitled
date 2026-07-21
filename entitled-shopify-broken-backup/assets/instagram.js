
var User_Id = $("#instafeed").data("user_id");
var Access_Token = $("#instafeed").data("access_token");
var limit = $("#instafeed").data("limit");


var userFeed = new Instafeed({
    get: 'user',
    userId: User_Id,
    accessToken: Access_Token,
    limit: limit,
    resolution: 'low_resolution',
    template: '<div class="insta_item"><a href="{{link}}" target="_blank"><div class="insta_item_overlay"><ul><li><span><i class="fa fa-heart"></i></span>{{likes}}</li><li><span><i class="fa fa-comment-o"></i></span>{{comments}}</li></ul></div><img src="{{image}}" /></a></div>',
    after:function(){ mobile();}
});

userFeed.run();


  function mobile() {
	var checkWidth = $(window).width();
	var demo = $("#instafeed");
	
	if(checkWidth > 767) {
		//demo.data('owlCarousel').destroy(); 
		demo.removeClass('owl-carousel');
	}	
	else if(checkWidth < 768) {
		demo.owlCarousel({
		  singleItem:true,
		  dots: true,
		  navigation: false
		});
	}
}

 

  
  